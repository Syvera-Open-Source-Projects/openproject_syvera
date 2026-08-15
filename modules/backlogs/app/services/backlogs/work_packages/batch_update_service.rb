# frozen_string_literal: true

#-- copyright
# OpenProject is an open source project management software.
# Copyright (C) the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See COPYRIGHT and LICENSE files for more details.
#++

# Moves an ordered batch of work packages into one Backlogs list as a single
# atomic operation. Each member is moved through the existing single-work-
# package UpdateService, always inserting after the previously moved member,
# so the batch lands as one contiguous block in input order.
class Backlogs::WorkPackages::BatchUpdateService
  # A real exception, deliberately not ActiveRecord::Rollback: the raise
  # happens inside the joined transactions the advisory-lock helper opens,
  # and a joined transaction swallows ActiveRecord::Rollback without rolling
  # back the outer transaction. A StandardError propagates through every
  # joined block, rolls the outer transaction back, and carries the failed
  # result out to the rescue below.
  class BatchFailure < StandardError
    attr_reader :result

    def initialize(result)
      @result = result
      super(result.message)
    end
  end

  attr_reader :user, :work_packages

  def initialize(user:, work_packages:)
    @user = user
    @work_packages = work_packages
  end

  # A placement is one of three modes, resolved before any lock is taken:
  # :explicit (nonblank prev_id → anchor work package), :top (blank
  # prev_id → no anchor), :append (absent prev_id → the last non-batch
  # member of the target, resolved NOW so it participates in the lock set
  # and can be revalidated under lock; nil anchor means an empty target).
  Placement = Data.define(:mode, :anchor) do
    def initial_prev_id = anchor ? anchor.id.to_s : ""
  end

  def call(list_type: nil, list_id: nil, prev_id: nil) # rubocop:disable Metrics/AbcSize
    target = Backlogs::Target.from_list(list_type, list_id)
    return invalid_target_failure unless target

    # Captured once, up front, and memoized: every later use of
    # batch_project_id (placement resolution, anchor revalidation, the
    # cohort check below) must agree on the SAME project, not re-derive it
    # from a work_packages.first that a concurrent move could have already
    # relocated.
    @batch_project_id = work_packages.first.project_id

    placement = resolve_placement(target, prev_id)
    return placement if placement.is_a?(ServiceResult)

    moved = []

    WorkPackage.transaction do
      with_ordered_locks(lock_entries(placement.anchor)) do
        revalidate_cohort!
        revalidate_anchor!(placement, target)
        current_prev_id = placement.initial_prev_id

        work_packages.each do |work_package|
          # Every batch member was loaded once, up front, before any member
          # moved, and revalidate_cohort! above only reloaded them to check
          # project identity. An earlier member's move_after shifts other
          # rows' persisted positions via update_all without touching their
          # loaded Ruby objects, so by the time a later member's turn comes
          # its in-memory position may already be stale even though its
          # project is not. remove_from_list decrements lower items using
          # that in-memory position as the threshold, so a stale read here
          # does not just misreport — it corrupts the positions it writes.
          # Reload immediately before the move so it acts on the positions
          # this same transaction has already committed.
          work_package.reload
          inner = Backlogs::WorkPackages::UpdateService
            .new(user:, work_package:)
            .call(list_type:, list_id:, prev_id: current_prev_id)

          raise BatchFailure, inner if inner.failure?

          moved << inner.result
          current_prev_id = inner.result.id.to_s
        end

        # A later member's move can shift an earlier member's persisted row
        # via update_all (see the in-loop comment above) without touching
        # that earlier member's Ruby instance. WorkPackage#call_after_update_hook
        # builds its context from `self`, so any consumer of the
        # work_package_after_update hook would otherwise observe an interim
        # position instead of the batch's final state. Reload every moved
        # instance here, still inside the lock and the outer transaction, so
        # the after-commit hooks fire against final rows.
        moved.each(&:reload)
      end
    end

    ServiceResult.success(result: moved)
  rescue BatchFailure => e
    e.result
  rescue StandardError => e
    # The parent design requires every failure OR exception to roll back
    # and return one failed batch result — an operational exception from a
    # later member must not escape as a 500 after the rollback already
    # happened. The transaction has rolled back by the time this rescue
    # runs (real exceptions propagate through joined transactions). The
    # exception message is internal adapter detail and unlocalized, so it
    # is logged rather than surfaced in the user-facing flash.
    Rails.logger.error { "Backlogs batch move failed: #{e.class}: #{e.message}" }
    ServiceResult.failure(message: I18n.t("backlogs.work_packages.batch_update_service.unexpected_failure"))
  end

  private

  # Every batch member plus the placement anchor — explicit predecessor OR
  # the pre-resolved append anchor — in ascending id order. Both
  # overlapping batches then request the same lock sequence, so neither can
  # hold one lock while waiting unboundedly for the other (the lock helper
  # retries forever). The gem tracks held locks per thread, so the inner
  # services' own acquisition of the same lock names yields immediately.
  def lock_entries(anchor)
    (work_packages + [anchor]).compact.uniq.sort_by(&:id)
  end

  def with_ordered_locks(entries, &)
    return yield if entries.empty?

    OpenProject::Mutex.with_advisory_lock_transaction(entries.first) do
      with_ordered_locks(entries.drop(1), &)
    end
  end

  # Absent prev_id appends; blank (including whitespace-only, matching
  # Rails blankness) inserts at the top; a nonblank prev_id must be a pure
  # integer id — anything else is rejected rather than letting Active
  # Record integer-cast a digit-prefixed string. The anchor is scoped to
  # the batch project: the acts_as_list scope includes project_id, so in a
  # shared sprint a work package of another project would pass a
  # container-only comparison yet be unresolvable for move_after, which
  # then silently inserts at the top. A batch member can never be its own
  # insertion anchor.
  def resolve_placement(target, prev_id) # rubocop:disable Metrics/AbcSize
    return Placement.new(mode: :append, anchor: last_non_batch_member(target)) if prev_id.nil?
    return Placement.new(mode: :top, anchor: nil) if prev_id.to_s.blank?
    return stale_predecessor_failure unless prev_id.to_s.match?(/\A\d+\z/)
    return stale_predecessor_failure if work_packages.any? { |wp| wp.id == prev_id.to_i }

    anchor = WorkPackage.where(project_id: batch_project_id).find_by(id: prev_id)
    anchor ? Placement.new(mode: :explicit, anchor:) : stale_predecessor_failure
  end

  # Between the controller loading the batch (scoped to @project) and lock
  # acquisition here, a member could have been moved to another project by
  # someone else. The in-loop reload above only refreshes position — it
  # would happily pick up the new project too, and against a shared sprint
  # the inner UpdateService's acts_as_list scope includes project_id, so the
  # hopped member could complete its own move in a DIFFERENT scope, splitting
  # the batch's contiguous block. The chained prev_id would then cross
  # scopes and hit move_after's silent insert-at-top. Catch the whole cohort
  # up front, before any member is touched.
  def revalidate_cohort!
    work_packages.each(&:reload)
    return if work_packages.all? { |wp| wp.project_id == batch_project_id }

    raise BatchFailure, stale_batch_failure
  end

  # Under lock, the anchor must still be exactly what placement resolution
  # saw: same project, same target list — and for append, still the LAST
  # non-batch member, or the batch would land mid-list instead of at the
  # end. Without this, a concurrently moved anchor would fall through to
  # move_after's silent insert-at-top and diverge from the client's
  # optimistic order.
  def revalidate_anchor!(placement, target) # rubocop:disable Metrics/AbcSize
    anchor = placement.anchor
    return if anchor.nil?

    anchor.reload
    unless anchor.project_id == batch_project_id &&
           Backlogs::Target.for_work_package(anchor) == target
      raise BatchFailure, stale_predecessor_failure
    end

    if placement.mode == :append && last_non_batch_member(target)&.id != anchor.id
      raise BatchFailure, stale_predecessor_failure
    end
  rescue ActiveRecord::RecordNotFound
    raise BatchFailure, stale_predecessor_failure
  end

  def last_non_batch_member(target)
    WorkPackage
      .where(project_id: batch_project_id, **target.attributes)
      .where.not(id: work_packages.map(&:id))
      .order(:position)
      .last
  end

  def batch_project_id
    @batch_project_id
  end

  def invalid_target_failure
    ServiceResult.failure(message: I18n.t("backlogs.work_packages.update_service.invalid_target_type"))
  end

  def stale_predecessor_failure
    ServiceResult.failure(message: I18n.t("backlogs.work_packages.batch_update_service.stale_predecessor"))
  end

  def stale_batch_failure
    ServiceResult.failure(message: I18n.t("backlogs.work_packages.batch_update_service.stale_batch"))
  end
end
