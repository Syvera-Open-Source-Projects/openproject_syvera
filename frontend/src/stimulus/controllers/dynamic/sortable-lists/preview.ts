//-- copyright
// OpenProject is an open source project management software.
// Copyright (C) the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
//
// See COPYRIGHT and LICENSE files for more details.
//++

// Builds the custom native drag preview for a sortable item: a sanitised clone
// of the item's preview target, sized to match and carrying the originating
// Box's density so its card styling survives being mounted outside the Box.

// Attributes stripped from the cloned drag preview so it carries no behaviour or
// stale interaction state. The dynamic `data-*--*-target` attributes are removed
// separately in sanitizePreview.
// `data-batch-selected` is deliberately absent: it lives on the sortable
// item element (the row, in Backlogs), while the preview target is the card
// — the row's child, never its clone. It can never end up on this clone, so
// stripping it here would be dead code.
const PREVIEW_STRIPPED_ATTRIBUTES = [
  'data-controller',
  'data-action',
  'data-dragging',
  'data-drop-position',
  'data-drop-position-owner',
  'aria-current',
  'aria-describedby',
  'aria-disabled',
  'aria-roledescription',
] as const;

// Box density variant classes copied onto the drag-preview container. The preview is
// mounted outside the originating Box, so variant-scoped card styles (e.g.
// `.Box--condensed .Box-card`) would not apply to it otherwise.
const BOX_DENSITY_VARIANT_CLASSES = ['Box--condensed', 'Box--spacious'] as const;

// The count badge added to a multi-card drag's preview. Styled inline rather
// than through a stylesheet class, matching this file's own approach for the
// clone's width and margin above: the preview is a native drag image built
// outside the page's normal render tree, so it must be legible even where no
// stylesheet has had a chance to apply to it.
const BATCH_BADGE_CLASS = 'op-sortable-lists-drag-preview-batch-badge';

export function renderDragPreview({
  previewTarget,
  sourceElement,
  container,
  batchSize = 1,
}:{
  previewTarget:HTMLElement;
  sourceElement:HTMLElement;
  container:HTMLElement;
  // The number of rows the drag represents. The approved design: a batch
  // larger than one card adds a count badge to the preview so a multi-card
  // drag reads differently from dragging a single card.
  batchSize?:number;
}):void {
  const previewWidth = previewTarget.getBoundingClientRect().width;
  const preview = previewTarget.cloneNode(true) as HTMLElement;

  sanitizePreview(preview);
  preview.setAttribute('data-preview', '');

  if (previewWidth > 0) {
    preview.style.width = `${previewWidth}px`;
  }

  // Margin utility classes on the source (e.g. mt-3 on a section box) would
  // render as whitespace inside the preview container.
  preview.style.margin = '0';

  const box = sourceElement.closest('.Box');

  BOX_DENSITY_VARIANT_CLASSES.forEach((variant) => {
    if (box?.classList.contains(variant)) {
      container.classList.add(variant);
    }
  });

  container.append(preview);

  if (batchSize > 1) {
    // Anchors the badge's absolute positioning to the container itself
    // rather than whatever ancestor Pragmatic happens to mount it under.
    container.style.position = 'relative';
    container.append(renderBatchBadge(preview.ownerDocument, batchSize));
  }
}

// Absolutely positioned over the card clone's top-right corner. The
// container is the preview mount Pragmatic hands render(); giving it
// position:relative here (rather than assuming the caller already set it)
// keeps the badge anchored to the card regardless of what else mounts there.
function renderBatchBadge(document:Document, batchSize:number):HTMLElement {
  const badge = document.createElement('span');
  badge.className = BATCH_BADGE_CLASS;
  badge.textContent = String(batchSize);
  Object.assign(badge.style, {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: '999px',
    backgroundColor: 'var(--bgColor-emphasis, #1f2328)',
    color: 'var(--fgColor-onEmphasis, #ffffff)',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '20px',
    textAlign: 'center',
    boxShadow: 'var(--shadow-floating-medium, 0 1px 3px rgba(0, 0, 0, 0.3))',
  });

  return badge;
}

export function sanitizePreview(element:HTMLElement):void {
  // Avoid side effects from custom elements (e.g. Primer include-fragment) in the cloned preview.
  element.querySelectorAll('include-fragment').forEach((fragment) => fragment.remove());

  const nodes = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))];

  for (const node of nodes) {
    PREVIEW_STRIPPED_ATTRIBUTES.forEach((attribute) => node.removeAttribute(attribute));

    for (const attribute of Array.from(node.attributes)) {
      if (/^data-.+--.+-target$/.test(attribute.name)) {
        node.removeAttribute(attribute.name);
      }
    }
  }
}
