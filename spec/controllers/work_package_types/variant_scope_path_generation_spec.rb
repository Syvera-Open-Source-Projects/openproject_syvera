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

require "spec_helper"

# The variant screens carry an optional project segment, and where it sits in the path decides what
# an argument nobody named means. Behind the type it is inert: a positional argument fills the type,
# and a caller that says nothing about a project gets none. Ahead of the type — which is where a
# project prefix would naturally go — it would take that positional argument for itself as soon as
# the type is already a path parameter, and quietly produce a URL naming the type's id as a project.
#
# So this is what allows every call site in the codebase to go on passing a type positionally, and
# nothing in Ruby or Rails would report the difference.
#
# Deliberately a controller spec: both the fallback on path parameters and the project the scope
# adds only exist in a request context. From the bare url_helpers every form here looks correct.
module WorkPackageTypes
  RSpec.describe WorkflowTabController do
    shared_let(:type) { create(:type) }
    shared_let(:project) { create(:project) }

    describe "from administration" do
      current_user { create(:admin) }

      before { get :edit, params: { type_id: type.id } }

      it "fills the type from a positional argument" do
        expect(edit_type_workflow_path(type)).to eq("/types/#{type.id}/workflow/edit")
      end

      it "generates the same path from a named one" do
        expect(edit_type_workflow_path(type_id: type.id)).to eq(edit_type_workflow_path(type))
      end

      it "names no project" do
        expect(edit_type_workflow_path(type)).not_to include("in-project")
      end
    end

    describe "from a project", with_flag: { type_variants: true } do
      shared_let(:variant) { create(:project_owned_type_variant, type:, project:) }

      current_user do
        create(:user, member_with_permissions: { project => %i[manage_project_variants] })
      end

      before { get :edit, params: { project_id: project.id, type_id: type.id, variant_id: variant.id } }

      # Every screen reached from here stays inside the project without anything saying so, which is
      # what lets one component render in both scopes.
      it "adds the project to a path that does not mention one" do
        expect(edit_type_workflow_path(type))
          .to eq("/types/#{type.id}/in-project/#{project.id}/workflow/edit")
      end

      it "reaches administration's copy only when the project is named away" do
        expect(edit_type_workflow_path(type_id: type.id, project_id: nil))
          .to eq("/types/#{type.id}/workflow/edit")
      end
    end
  end
end
