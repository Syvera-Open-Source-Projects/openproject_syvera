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

# Every screen a project reaches is rendered by administration's own components, which name their
# routes without knowing which of the two addresses they are on. The project comes from the
# request, so a component that reaches for a path some other way — a helper that drops the scope,
# a hand-built string, an explicitly nil project — sends the reader to a URL administration owns
# and the reader cannot open.
#
# Rendering specs do not judge the URLs in what they rendered, and a status code cannot: the page
# is fine, its links are not. So this walks each tab and holds every variant URL on it to the
# project.
RSpec.describe "The URLs a project's variant screens generate",
               :skip_csrf,
               type: :rails_request,
               with_flag: { type_variants: true } do
  shared_let(:project) { create(:project) }
  shared_let(:type) { create(:type, name: "Bug") }
  shared_let(:ours) { create(:project_owned_type_variant, type:, project:, variant_name: "Ours") }
  shared_let(:actor) { create(:user, member_with_permissions: { project => %i[manage_project_variants] }) }

  before { login_as actor }

  def variant_urls
    response.body.scan(/(?:action|href|src|data-drop-url|drop-url)="([^"]*\/types\/[^"]*)"/)
            .flatten.uniq.reject { |url| url.include?("/api/") }
  end

  {
    "details" => :edit_type_details_path,
    "defaults" => :edit_type_defaults_path,
    "form configuration" => :edit_type_form_configuration_path,
    "project attributes" => :edit_type_project_attributes_path,
    "export configuration" => :edit_type_pdf_export_template_index_path
  }.each do |name, helper|
    it "keeps the project in every variant URL on the #{name} tab" do
      get send(helper, project_id: project, type_id: type.id, variant_id: ours.id)

      expect(response).to have_http_status(:ok)
      urls = variant_urls
      expect(urls).not_to be_empty, "expected the #{name} tab to link somewhere"

      administration = urls.reject { |url| url.include?("in-project/#{project.identifier}") }
      expect(administration).to be_empty,
                                "the #{name} tab points at administration:\n  #{administration.join("\n  ")}"
    end
  end
end
