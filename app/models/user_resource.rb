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

# A reusable, named description of the kind of person a resource allocation
# asks for ("Senior Developer, speaks DE or EN"). It is a Principal so it can
# be referenced, rendered and picked like any other party, but it is never a
# human: it cannot log in, cannot be a member and holds no custom fields.
#
# What it *is* defined by is the user filter, because the matching rules need
# boolean structure that custom field values cannot express — `languages` being
# "DE or EN" versus "DE and EN" is a difference in the filter operator, not in
# the stored values.
class UserResource < Principal
  alias_attribute(:name, :lastname)

  validates(:name, presence: true)
  validates(:name, uniqueness: true)
  validates :name, length: { maximum: 256 }

  has_details_table(foreign_key: :principal_id) do
    serialize :user_filter, coder: Queries::Serialization::Filters.new(UserQuery)

    # A resource without filters would match every user in the instance, which
    # is never what someone means to request.
    validates :user_filter, presence: true
  end

  has_many :resource_allocations,
           class_name: "ResourceAllocation",
           dependent: :restrict_with_error,
           inverse_of: :user_resource

  scopes :visible

  # Columns required for formatting the user resource's name.
  def self.columns_for_name(_formatter = nil)
    [:lastname]
  end

  def to_s
    lastname
  end

  # The users this resource stands for. `UserQuery`'s default scope is
  # `User.user.visible`, so the result is always scoped to the current user —
  # callers that need the instance-wide count have to say so explicitly.
  def candidate_query
    UserQuery.new.tap do |query|
      user_filter.each do |filter|
        query.where(filter.field, filter.operator, filter.values)
      end
    end
  end
end
