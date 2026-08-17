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

RSpec.describe "Project settings: work package custom fields", :skip_csrf, type: :rails_request do
  shared_let(:project) { create(:project, name: "My Project") }
  shared_let(:custom_field) { create(:work_package_custom_field, name: "Severity") }
  shared_let(:user) do
    create(:user, member_with_permissions: { project => %i[edit_project select_custom_fields] })
  end

  let(:screen_path) { project_settings_work_packages_custom_fields_path(project) }

  before { login_as user }

  def activate_custom_field
    patch screen_path, params: { project: { work_package_custom_field_ids: [custom_field.id] } }
  end

  it "offers the screen" do
    get screen_path

    expect(response).to have_http_status(:ok)
  end

  it "activates the submitted custom fields" do
    activate_custom_field

    expect(project.reload.work_package_custom_field_ids).to contain_exactly(custom_field.id)
  end

  it "advertises the screen in the work packages settings nav" do
    get project_settings_work_packages_internal_comments_path(project)

    expect(response.body).to include(screen_path)
  end

  context "when the variants feature is enabled", with_flag: { type_variants: true } do
    it "hides the screen" do
      get screen_path

      expect(response).to have_http_status(:not_found)
    end

    it "refuses to activate custom fields", :aggregate_failures do
      activate_custom_field

      expect(response).to have_http_status(:not_found)
      expect(project.reload.work_package_custom_field_ids).to be_empty
    end

    it "drops the tab from the work packages settings nav" do
      get project_settings_work_packages_internal_comments_path(project)

      expect(response.body).not_to include(screen_path)
    end

    it "redirects the settings section to a screen that is still available" do
      get project_settings_work_packages_path(project)

      expect(response).to redirect_to(project_settings_work_packages_internal_comments_path(project))
    end
  end
end
