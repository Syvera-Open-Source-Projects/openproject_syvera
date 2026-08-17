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

RSpec.describe "Admin: projects of a work package custom field", :skip_csrf, type: :rails_request do
  shared_let(:project) { create(:project) }
  shared_let(:custom_field) { create(:work_package_custom_field) }

  let(:screen_path) { custom_field_projects_path(custom_field) }

  current_user { create(:admin) }

  def activate_in_project
    post screen_path, params: { custom_fields_project: { project_ids: [project.id] } }, as: :turbo_stream
  end

  it "offers the screen" do
    get screen_path

    expect(response).to have_http_status(:ok)
  end

  it "activates the custom field in the submitted projects" do
    activate_in_project

    expect(custom_field.reload.project_ids).to contain_exactly(project.id)
  end

  it "advertises the screen on the custom field's tab nav" do
    get edit_custom_field_path(custom_field)

    expect(response.body).to include(screen_path)
  end

  context "when the variants feature is enabled", with_flag: { type_variants: true } do
    it "hides the screen" do
      get screen_path

      expect(response).to have_http_status(:not_found)
    end

    it "refuses to activate the custom field in a project", :aggregate_failures do
      activate_in_project

      expect(response).to have_http_status(:not_found)
      expect(custom_field.reload.project_ids).to be_empty
    end

    it "drops the tab from the custom field's tab nav" do
      get edit_custom_field_path(custom_field)

      expect(response.body).not_to include(screen_path)
    end
  end
end
