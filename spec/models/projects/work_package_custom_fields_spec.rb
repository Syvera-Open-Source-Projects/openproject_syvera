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

RSpec.describe Projects::WorkPackageCustomFields do
  shared_let(:activated) { create(:work_package_custom_field, is_for_all: false) }
  shared_let(:not_activated) { create(:work_package_custom_field, is_for_all: false) }
  shared_let(:for_all) { create(:work_package_custom_field, is_for_all: true) }
  shared_let(:project) { create(:project, work_package_custom_fields: [activated]) }

  describe "#all_work_package_custom_fields" do
    subject { project.all_work_package_custom_fields }

    it "offers what the project activated plus the instance-wide fields" do
      expect(subject).to contain_exactly(activated, for_all)
    end

    context "when the variants feature is enabled", with_flag: { type_variants: true } do
      it "stops letting the project's own activations restrict anything" do
        expect(subject).to contain_exactly(activated, not_activated, for_all)
      end
    end
  end
end
