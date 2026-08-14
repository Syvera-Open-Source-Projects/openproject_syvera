# frozen_string_literal: true

# -- copyright
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
# ++

module Types
  class EditPageHeaderComponent < ApplicationComponent
    include OpPrimer::ComponentHelpers
    include ApplicationHelper
    include TabsHelper

    def initialize(type:, variant: nil, tabs: nil)
      super
      @type = type
      @variant = variant
      @tabs = tabs
    end

    def breadcrumb_items
      [*root_breadcrumb_items, *type_breadcrumb_item, breadcrumb_leaf]
    end

    def title
      return @type.name unless named_variant?

      t("types.edit.breadcrumb_variant", name: @variant.variant_name)
    end

    private

    def named_variant? = @variant.is_a?(TypeVariant) && !@variant.is_default_variant?

    def scope_project = helpers.variant_scope_project

    # Where the screen was reached from decides the trail: administration's own root, or the
    # settings of the project whose variant this is.
    def root_breadcrumb_items
      return administration_breadcrumb_items if scope_project.nil?

      [{ href: project_overview_path(scope_project.id), text: scope_project.name },
       { href: project_settings_general_path(scope_project.id), text: t("label_project_settings") },
       { href: project_settings_work_packages_types_path(scope_project), text: t(:label_work_package_plural) }]
    end

    def administration_breadcrumb_items
      [{ href: admin_index_path, text: t("label_administration") },
       { href: admin_settings_work_packages_general_path, text: t(:label_work_package_plural) },
       { href: types_path, text: t(:label_type_plural) }]
    end

    # The type's own configuration belongs to administration, so from a project the parent leads
    # back to that project's list of types — where its variants are — rather than to a screen
    # the caller cannot open.
    def type_breadcrumb_item
      return [] unless named_variant?

      [{ href: type_breadcrumb_href, text: @type.name }]
    end

    def type_breadcrumb_href
      return edit_type_details_path(type_id: @type.id) if scope_project.nil?

      project_settings_work_packages_types_path(scope_project)
    end

    def breadcrumb_leaf
      title
    end
  end
end
