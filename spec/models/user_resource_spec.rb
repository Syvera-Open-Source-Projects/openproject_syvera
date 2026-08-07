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

RSpec.describe UserResource do
  subject(:user_resource) { create(:user_resource, name: "Senior Developer") }

  def filters_for(field, operator, values)
    UserQuery.new.tap { |query| query.where(field, operator, values) }.filters
  end

  describe "validations" do
    it "requires a name" do
      expect(described_class.new(user_filter: filters_for("name", "~", ["dev"]))).not_to be_valid
    end

    it "requires the name to be unique" do
      user_resource
      expect(described_class.new(name: "Senior Developer",
                                 user_filter: filters_for("name", "~", ["dev"]))).not_to be_valid
    end

    # Without filters the resource would stand for every user in the instance.
    it "requires at least one filter" do
      resource = described_class.new(name: "Anyone at all")

      expect(resource).not_to be_valid
      expect(resource.errors[:user_filter]).to be_present
    end
  end

  describe "the user filter" do
    it "round-trips through the detail table as deserialized filters" do
      user_resource.update!(user_filter: filters_for("name", "~", ["dev"]))

      reloaded = described_class.find(user_resource.id)

      expect(reloaded.detail).to be_a(UserResourceDetail)
      expect(reloaded.user_filter.map { |f| [f.name, f.operator, f.values] })
        .to eq([[:name, "~", ["dev"]]])
    end

    it "is reported through the owner's dirty tracking" do
      user_resource.user_filter = filters_for("name", "~", ["other"])

      expect(user_resource.changed).to include("user_filter")
    end
  end

  describe "#candidate_query" do
    let!(:matching) { create(:user, firstname: "Dev", lastname: "Eloper") }
    let!(:other) { create(:user, firstname: "Sales", lastname: "Person") }

    current_user { create(:admin) }

    it "returns the users the filter describes" do
      user_resource.update!(user_filter: filters_for("name", "~", ["Eloper"]))

      expect(user_resource.candidate_query.results).to contain_exactly(matching)
    end
  end

  describe "as a principal" do
    current_user { create(:admin) }

    it "is not returned by scopes that select actual users" do
      expect(User.where(id: user_resource.id)).to be_empty
      expect(Principal.human.where(id: user_resource.id)).to be_empty
      expect(Principal.find(user_resource.id)).to eq(user_resource)
    end

    # UserQuery's default scope is User.user.visible, so a resource can never
    # match its own filter or another resource's.
    it "is not a candidate for any user filter" do
      user_resource.update!(user_filter: filters_for("name", "~", ["Senior"]))

      expect(user_resource.candidate_query.results).to be_empty
    end
  end
end
