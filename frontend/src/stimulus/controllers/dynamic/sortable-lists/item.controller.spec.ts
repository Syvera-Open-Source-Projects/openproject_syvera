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

// vi.doMock is not hoisted above imports, unlike vi.mock, so the subject
// below is imported dynamically further down, after these calls run.
vi.doMock('@atlaskit/pragmatic-drag-and-drop/combine', () => ({
  combine: vi.fn((...cleanups:(() => void)[]) => vi.fn(() => {
    cleanups.forEach((cleanup) => cleanup());
  })),
}));

vi.doMock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: vi.fn(() => vi.fn()),
  dropTargetForElements: vi.fn(() => vi.fn()),
  monitorForElements: vi.fn(() => vi.fn()),
}));

vi.doMock('@atlaskit/pragmatic-drag-and-drop/prevent-unhandled', () => ({
  preventUnhandled: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.doMock('@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview', () => ({
  setCustomNativeDragPreview: vi.fn(),
}));

import type { draggable as draggableFn, dropTargetForElements as dropTargetForElementsFn } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { setCustomNativeDragPreview as setCustomNativeDragPreviewFn } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import type { preventUnhandled as preventUnhandledType } from '@atlaskit/pragmatic-drag-and-drop/prevent-unhandled';
import { setupStimulusTest, type StimulusTestContext } from 'core-stimulus/test-helpers';
import type { ActionEvent } from '@hotwired/stimulus';
import type ItemControllerType from './item.controller';
import type { SortableListsRoot } from './drag-and-drop';
import type { DestinationIdentity } from './list-dom';
import type { ActionScope } from './selection-orchestrator';

describe('Sortable lists item controller', () => {
  let draggable:typeof draggableFn;
  let dropTargetForElements:typeof dropTargetForElementsFn;
  let preventUnhandled:typeof preventUnhandledType;
  let setCustomNativeDragPreview:typeof setCustomNativeDragPreviewFn;
  let ItemController:typeof ItemControllerType;
  let sortableItemData:typeof import('./drag-and-drop').sortableItemData;

  interface TestItemController {
    renderDropIndicator(edge:'top'|'bottom'|null):void;
    clearDropIndicator():void;
    disconnect():void;
  }

  beforeAll(async () => {
    ({ draggable, dropTargetForElements } = await import('@atlaskit/pragmatic-drag-and-drop/element/adapter'));
    ({ preventUnhandled } = await import('@atlaskit/pragmatic-drag-and-drop/prevent-unhandled'));
    ({ setCustomNativeDragPreview } = await import('@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'));
    ({ default: ItemController } = await import('./item.controller'));
    ({ sortableItemData } = await import('./drag-and-drop'));
  });

  function controllerFor(element:HTMLElement) {
    const controller = Object.create(ItemController.prototype) as unknown as TestItemController;

    Object.defineProperty(controller, 'element', { value: element });
    Object.defineProperty(controller, 'idValue', { value: '1' });
    Object.defineProperty(controller, 'typeValue', { value: 'item' });

    return controller;
  }

  function fakeRoot(
    element = document.createElement('div'),
    { busy = false, ownerListElement = null, ownerRowsContainer = () => null }:{
      busy?:boolean;
      ownerListElement?:HTMLElement|null;
      ownerRowsContainer?:(itemElement:HTMLElement) => HTMLElement|null;
    } = {},
  ):SortableListsRoot {
    Object.defineProperty(element, 'isConnected', { value: true, configurable: true });
    return {
      element,
      busy,
      actionScopeFor: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
      selectForAction: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
      prepareActionMenu: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
      availableDestinations: vi.fn(() => []),
      moveToDestination: vi.fn(),
      moveInDirection: vi.fn(),
      moveAvailability: vi.fn(() => null),
      ownerListElementOf: vi.fn(() => ownerListElement),
      ownerRowsContainer: vi.fn(ownerRowsContainer),
      beginDragBatch: vi.fn(),
      activeDragBatchCount: vi.fn(() => 0),
    };
  }

  function connectedControllerFor(
    element:HTMLElement,
    {
      handle = null,
      root = fakeRoot(),
      externalUrl = null,
      label = null,
      mobility = 'free',
    }:{
      handle?:HTMLElement|null;
      root?:SortableListsRoot|null;
      externalUrl?:string|null;
      label?:string|null;
      mobility?:string;
    } = {},
  ) {
    const controller = Object.create(ItemController.prototype) as InstanceType<typeof ItemControllerType>;

    Object.defineProperty(controller, 'element', { value: element });
    Object.defineProperty(controller, 'idValue', { value: '123' });
    Object.defineProperty(controller, 'hasIdValue', { value: true });
    Object.defineProperty(controller, 'typeValue', { value: 'item' });
    Object.defineProperty(controller, 'hasTypeValue', { value: true });
    Object.defineProperty(controller, 'externalUrlValue', { value: externalUrl ?? '' });
    Object.defineProperty(controller, 'hasExternalUrlValue', { value: externalUrl !== null });
    Object.defineProperty(controller, 'labelValue', { value: label ?? '' });
    Object.defineProperty(controller, 'hasLabelValue', { value: label !== null });
    // Written to the element, not stubbed as a controller property: the
    // controller reads mobility through list-dom's parser so that missing and
    // malformed values resolve in exactly one place. Stubbing the value here
    // would bypass that parser and test something the controller never does.
    element.setAttribute('data-sortable-lists--item-mobility-value', mobility);
    Object.defineProperty(controller, 'hasHandleTarget', { value: handle !== null });
    if (handle) {
      Object.defineProperty(controller, 'handleTarget', { value: handle });
    }

    controller.connect();
    if (root) {
      controller.connectRoot(root);
    }

    return controller;
  }

  function draggableArgs(element = document.createElement('article')) {
    return {
      dragHandle: null,
      element,
      input: {} as never,
    };
  }

  function dragEventPayload(element = document.createElement('article')) {
    return {
      location: { current: { input: { clientX: 0, clientY: 0 } } } as never,
      source: {
        data: {},
        dragHandle: null,
        element,
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dropTargetForElements).mockImplementation(({ element }) => {
      element.setAttribute('data-drop-target-for-element', 'true');

      return vi.fn(() => {
        element.removeAttribute('data-drop-target-for-element');
      });
    });
    // Mirrors the real adapter's addAttribute side effect, so movability tests
    // can assert on the same `draggable` attribute Pragmatic marks in production.
    vi.mocked(draggable).mockImplementation(({ element }) => {
      element.setAttribute('draggable', 'true');

      return vi.fn(() => {
        element.removeAttribute('draggable');
      });
    });
  });

  function connectItem({ id, type }:{ id:string; type:string }) {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const controller = Object.create(ItemController.prototype) as InstanceType<typeof ItemControllerType>;

    Object.defineProperty(controller, 'element', { value: document.createElement('li') });
    Object.defineProperty(controller, 'idValue', { value: id });
    Object.defineProperty(controller, 'hasIdValue', { value: id !== '' });
    Object.defineProperty(controller, 'typeValue', { value: type });
    Object.defineProperty(controller, 'hasTypeValue', { value: type !== '' });

    Object.defineProperty(controller, 'hasHandleTarget', { value: false });

    controller.connect();

    return warn;
  }

  it('registers a drag source', () => {
    const element = document.createElement('li');

    connectedControllerFor(element);

    expect(draggable).toHaveBeenCalledWith(expect.objectContaining({ element }));
  });

  it('warns when connected without an item id', () => {
    const warn = connectItem({ id: '', type: 'work_package' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('id'), expect.anything());
  });

  it('warns when connected without an item type', () => {
    const warn = connectItem({ id: '123', type: '' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('type'), expect.anything());
  });

  it('does not warn when id and type are both present', () => {
    const warn = connectItem({ id: '123', type: 'work_package' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('re-establishes registrations and the marker attribute on reregister', () => {
    const element = document.createElement('li');
    const controller = connectedControllerFor(element);

    controller.reregister();

    expect(draggable).toHaveBeenCalledTimes(2);
    expect(dropTargetForElements).toHaveBeenCalledTimes(2);
    // The mocked cleanup strips the marker attribute, so its presence shows the
    // fresh registration ran after the stale one was cleaned up.
    expect(element.getAttribute('data-drop-target-for-element')).toEqual('true');
  });

  it('marks the closest edge while dragging over an item', () => {
    const element = document.createElement('article');
    const controller = controllerFor(element);

    controller.renderDropIndicator('top');

    expect(element.dataset.dropPosition).toEqual('top');
  });

  it('marks the closest edge on the containing row when present', () => {
    const element = document.createElement('li');
    const controller = controllerFor(element);

    element.classList.add('Box-row');

    controller.renderDropIndicator('top');

    expect(element.dataset.dropPosition).toEqual('top');
  });

  it('renders the bottom edge as the next row top edge when both describe the same insertion point', () => {
    const element = document.createElement('li');
    const nextElement = document.createElement('li');
    const controller = controllerFor(element);

    element.setAttribute('data-sortable-lists--item-id-value', '1');
    nextElement.setAttribute('data-sortable-lists--item-id-value', '2');
    document.body.append(element, nextElement);

    controller.renderDropIndicator('bottom');

    expect(element.hasAttribute('data-drop-position')).toBe(false);
    expect(nextElement.dataset.dropPosition).toEqual('top');
  });

  it('removes the drop position when leaving an item', () => {
    const element = document.createElement('li');
    const nextElement = document.createElement('li');
    const controller = controllerFor(element);

    element.setAttribute('data-sortable-lists--item-id-value', '1');
    nextElement.setAttribute('data-sortable-lists--item-id-value', '2');
    document.body.append(element, nextElement);

    controller.renderDropIndicator('bottom');
    controller.clearDropIndicator();

    expect(element.hasAttribute('data-drop-position')).toBe(false);
    expect(nextElement.hasAttribute('data-drop-position')).toBe(false);
  });

  it('does not clear an indicator owned by another item controller', () => {
    const element = document.createElement('li');
    const nextElement = document.createElement('li');
    const controller = controllerFor(element);

    element.setAttribute('data-sortable-lists--item-id-value', '1');
    nextElement.setAttribute('data-sortable-lists--item-id-value', '2');
    document.body.append(element, nextElement);

    controller.renderDropIndicator('bottom');
    nextElement.dataset.dropPosition = 'top';
    nextElement.dataset.dropPositionOwner = '2';

    controller.clearDropIndicator();

    expect(nextElement.dataset.dropPosition).toEqual('top');
    expect(nextElement.dataset.dropPositionOwner).toEqual('2');
  });

  it('clears its own drop indicator when the item disconnects mid-drag', () => {
    const element = document.createElement('li');
    const nextElement = document.createElement('li');
    const controller = controllerFor(element);

    element.setAttribute('data-sortable-lists--item-id-value', '1');
    nextElement.setAttribute('data-sortable-lists--item-id-value', '2');
    document.body.append(element, nextElement);

    controller.renderDropIndicator('bottom');
    expect(nextElement.dataset.dropPosition).toEqual('top');

    // A list-refresh morph removes the hovering row: its controller disconnects
    // without an onDrop, so the indicator it owns on the sibling must be cleared
    // here or it lingers forever.
    controller.disconnect();

    expect(nextElement.hasAttribute('data-drop-position')).toBe(false);
    expect(nextElement.hasAttribute('data-drop-position-owner')).toBe(false);
  });

  describe('sticky drop target boundaries', () => {
    afterEach(() => {
      document.body.replaceChildren();
    });

    function mountedRows() {
      const list = document.createElement('ul');
      list.style.cssText = 'margin:0;padding:0;list-style:none;';

      const rows = ['1', '2', '3'].map(() => {
        const row = document.createElement('li');
        row.style.cssText = 'display:block;height:30px;margin:0 0 10px 0;';
        list.append(row);
        return row;
      });

      document.body.append(list);
      return rows;
    }

    function stickyAt(element:HTMLElement, clientY:number) {
      return vi.mocked(dropTargetForElements).mock.lastCall?.[0].getIsSticky?.({
        element,
        input: { clientY } as never,
        source: {
          data: {},
          element: document.createElement('article'),
        } as never,
      });
    }

    it('keeps the item drop target active while moving through row gaps', () => {
      const [first, second] = mountedRows();

      connectedControllerFor(first);

      const gapY = (first.getBoundingClientRect().bottom + second.getBoundingClientRect().top) / 2;
      expect(stickyAt(first, gapY)).toBe(true);
    });

    it('releases the sticky target above the first row, where the list header sits', () => {
      const [first] = mountedRows();

      connectedControllerFor(first);

      expect(stickyAt(first, first.getBoundingClientRect().top - 5)).toBe(false);
    });

    it('releases the sticky target below the last row, over the empty space', () => {
      const [first, , third] = mountedRows();

      connectedControllerFor(first);

      expect(stickyAt(first, third.getBoundingClientRect().bottom + 5)).toBe(false);
    });

    it('releases the sticky target once the row is detached from a rows container', () => {
      const row = document.createElement('li');

      connectedControllerFor(row);

      expect(stickyAt(row, 0)).toBe(false);
    });

    it('uses the root-resolved rows container when the DOM parent is not the rows container', () => {
      const [first, , third] = mountedRows();
      const list = first.parentElement!;
      // Wrap the item in an intermediate div, so its DOM parent (the wrapper,
      // holding only itself) no longer matches its actual rows container
      // (the list, holding all three rows). Only a root-resolved lookup can
      // still see the full rows span.
      const wrapper = document.createElement('div');
      first.replaceWith(wrapper);
      wrapper.append(first);

      connectedControllerFor(first, { root: fakeRoot(document.createElement('div'), { ownerRowsContainer: () => list }) });

      // Reachable only if the sticky bounds span the whole list (root-resolved);
      // the DOM-parent fallback (the one-row wrapper) would release well before it.
      expect(stickyAt(first, third.getBoundingClientRect().bottom - 1)).toBe(true);
    });
  });

  it('does not accept itself as an item drop target', () => {
    const root = document.createElement('div');
    const element = document.createElement('article');

    connectedControllerFor(element, { root: fakeRoot(root) });

    expect(vi.mocked(dropTargetForElements).mock.lastCall?.[0].canDrop?.({
      element,
      input: {} as never,
      source: {
        data: sortableItemData({ type: 'item', itemId: '123', rootElement: root }),
        element: document.createElement('article'),
      } as never,
    })).toBe(false);
  });

  it('does not accept drops from another sortable lists root', () => {
    const targetRoot = document.createElement('div');
    const foreignRoot = document.createElement('div');
    const targetElement = document.createElement('article');

    connectedControllerFor(targetElement, { root: fakeRoot(targetRoot) });

    expect(vi.mocked(dropTargetForElements).mock.lastCall?.[0].canDrop?.({
      element: targetElement,
      input: {} as never,
      source: {
        data: sortableItemData({ type: 'item', itemId: '456', rootElement: foreignRoot }),
        element: document.createElement('article'),
      } as never,
    })).toBe(false);
  });

  it('does not accept a drop whose type differs from its own', () => {
    const root = document.createElement('div');
    const targetElement = document.createElement('article');

    connectedControllerFor(targetElement, { root: fakeRoot(root) });

    expect(vi.mocked(dropTargetForElements).mock.lastCall?.[0].canDrop?.({
      element: targetElement,
      input: {} as never,
      source: {
        data: sortableItemData({ type: 'meeting_agenda_item', itemId: '456', rootElement: root }),
        element: document.createElement('article'),
      } as never,
    })).toBe(false);
  });

  it('accepts a same-type drop from another item in its root', () => {
    const root = document.createElement('div');
    const targetElement = document.createElement('article');

    connectedControllerFor(targetElement, { root: fakeRoot(root) });

    expect(vi.mocked(dropTargetForElements).mock.lastCall?.[0].canDrop?.({
      element: targetElement,
      input: {} as never,
      source: {
        data: sortableItemData({ type: 'item', itemId: '456', rootElement: root }),
        element: document.createElement('article'),
      } as never,
    })).toBe(true);
  });

  // A confined item may only land in its source list. Rows of that list keep
  // accepting it (within-list reorder), rows of any other list refuse it, and
  // with no payload list there is nothing it may land on.
  describe('a confined drag source', () => {
    function canDropOnto(targetElement:HTMLElement, root:HTMLElement, sourceListElement:HTMLElement|null) {
      return vi.mocked(dropTargetForElements).mock.lastCall?.[0].canDrop?.({
        element: targetElement,
        input: {} as never,
        source: {
          data: sortableItemData({
            type: 'item',
            itemId: '456',
            rootElement: root,
            sourceListElement,
            confined: true,
          }),
          element: document.createElement('article'),
        } as never,
      });
    }

    it('still registers a drag source', () => {
      const element = document.createElement('li');

      connectedControllerFor(element, { mobility: 'confined' });

      expect(draggable).toHaveBeenCalledWith(expect.objectContaining({ element }));
    });

    it('is accepted by a row inside its source list', () => {
      const root = document.createElement('div');
      const sourceList = document.createElement('div');
      const targetElement = document.createElement('article');
      sourceList.appendChild(targetElement);

      connectedControllerFor(targetElement, { root: fakeRoot(root) });

      expect(canDropOnto(targetElement, root, sourceList)).toBe(true);
    });

    it('is refused by a row of a foreign list', () => {
      const root = document.createElement('div');
      const sourceList = document.createElement('div');
      const targetElement = document.createElement('article');

      connectedControllerFor(targetElement, { root: fakeRoot(root) });

      expect(canDropOnto(targetElement, root, sourceList)).toBe(false);
    });

    it('is refused everywhere when its payload carries no source list', () => {
      const root = document.createElement('div');
      const targetElement = document.createElement('article');

      connectedControllerFor(targetElement, { root: fakeRoot(root) });

      expect(canDropOnto(targetElement, root, null)).toBe(false);
    });
  });

  it('accepts an unconfined drop from a row of another list', () => {
    const root = document.createElement('div');
    const foreignList = document.createElement('div');
    const targetElement = document.createElement('article');

    connectedControllerFor(targetElement, { root: fakeRoot(root) });

    expect(vi.mocked(dropTargetForElements).mock.lastCall?.[0].canDrop?.({
      element: targetElement,
      input: {} as never,
      source: {
        data: sortableItemData({
          type: 'item',
          itemId: '456',
          rootElement: root,
          sourceListElement: foreignList,
        }),
        element: document.createElement('article'),
      } as never,
    })).toBe(true);
  });

  it('does not accept drops while the root is busy moving another item', () => {
    const root = document.createElement('div');
    const targetElement = document.createElement('article');

    connectedControllerFor(targetElement, { root: fakeRoot(root, { busy: true }) });

    expect(vi.mocked(dropTargetForElements).mock.lastCall?.[0].canDrop?.({
      element: targetElement,
      input: {} as never,
      source: {
        data: sortableItemData({ type: 'item', itemId: '456', rootElement: root }),
        element: document.createElement('article'),
      } as never,
    })).toBe(false);
  });

  it('exposes the external URL as native drag data for external consumers', () => {
    const element = document.createElement('article');

    connectedControllerFor(element, { externalUrl: 'http://example.org/work_packages/123' });

    const externalData = vi.mocked(draggable).mock.lastCall?.[0]
      .getInitialDataForExternal?.(draggableArgs(element));

    expect(externalData).toEqual({
      'text/uri-list': 'http://example.org/work_packages/123',
      'text/plain': 'http://example.org/work_packages/123',
    });
  });

  it('adds a text/html link flavour when the item has a label', () => {
    const element = document.createElement('article');

    connectedControllerFor(element, {
      externalUrl: 'http://example.org/work_packages/123',
      label: 'Feature #123: Card subject',
    });

    const externalData = vi.mocked(draggable).mock.lastCall?.[0]
      .getInitialDataForExternal?.(draggableArgs(element));

    expect(externalData).toEqual({
      'text/uri-list': 'http://example.org/work_packages/123',
      'text/plain': 'http://example.org/work_packages/123',
      'text/html': '<a href="http://example.org/work_packages/123">Feature #123: Card subject</a>',
    });
  });

  it('escapes HTML-sensitive characters in the external link label', () => {
    const element = document.createElement('article');

    connectedControllerFor(element, {
      externalUrl: 'http://example.org/work_packages/123',
      label: '<script>alert("x")</script> & more',
    });

    const externalData = vi.mocked(draggable).mock.lastCall?.[0]
      .getInitialDataForExternal?.(draggableArgs(element));

    expect(externalData?.['text/html']).toBe(
      '<a href="http://example.org/work_packages/123">&lt;script&gt;alert("x")&lt;/script&gt; &amp; more</a>',
    );
  });

  it('does not expose native external drag data without an external URL', () => {
    const element = document.createElement('article');

    connectedControllerFor(element);

    expect(vi.mocked(draggable).mock.lastCall?.[0].getInitialDataForExternal).toBeUndefined();
  });

  it('does not expose native external drag data for a blank external URL', () => {
    const element = document.createElement('article');

    connectedControllerFor(element, { externalUrl: '' });

    expect(vi.mocked(draggable).mock.lastCall?.[0].getInitialDataForExternal).toBeUndefined();
  });

  it('prevents unhandled browser drag feedback while dragging an item', () => {
    const element = document.createElement('article');

    connectedControllerFor(element);

    vi.mocked(draggable).mock.lastCall?.[0].onDragStart?.(dragEventPayload(element));
    expect(preventUnhandled.start).toHaveBeenCalledOnce();

    vi.mocked(draggable).mock.lastCall?.[0].onDrop?.(dragEventPayload(element));
    expect(preventUnhandled.stop).toHaveBeenCalledOnce();
  });

  it('does not start dragging from interactive descendants', () => {
    const element = document.createElement('article');
    const link = document.createElement('a');

    link.href = '/work_packages/123';
    element.appendChild(link);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(link);
    connectedControllerFor(element);

    expect(vi.mocked(draggable).mock.lastCall?.[0].canDrag?.({
      element,
      dragHandle: null,
      input: { clientX: 10, clientY: 10 } as never,
    })).toBe(false);
  });

  it('starts dragging from non-interactive descendants', () => {
    const element = document.createElement('article');
    const text = document.createElement('span');

    element.appendChild(text);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(text);
    connectedControllerFor(element);

    expect(vi.mocked(draggable).mock.lastCall?.[0].canDrag?.({
      element,
      dragHandle: null,
      input: { clientX: 10, clientY: 10 } as never,
    })).toBe(true);
  });

  it('starts dragging from the focusable drag handle itself', () => {
    const element = document.createElement('li');
    const handle = document.createElement('article');

    handle.tabIndex = 0;
    handle.setAttribute('data-sortable-lists--item-target', 'preview handle');
    element.appendChild(handle);
    document.body.appendChild(element);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(handle);
    connectedControllerFor(element, { handle });

    expect(vi.mocked(draggable).mock.lastCall?.[0].canDrag?.({
      element,
      dragHandle: handle,
      input: { clientX: 10, clientY: 10 } as never,
    })).toBe(true);

    element.remove();
  });

  it('does not start dragging while the root is busy moving another item', () => {
    const element = document.createElement('article');
    const text = document.createElement('span');
    element.appendChild(text);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(text);

    connectedControllerFor(element, { root: fakeRoot(document.createElement('div'), { busy: true }) });

    expect(vi.mocked(draggable).mock.lastCall?.[0].canDrag?.({
      element, dragHandle: null, input: { clientX: 10, clientY: 10 } as never,
    })).toBe(false);
  });

  it('refuses to drag before the root reference is connected', () => {
    const element = document.createElement('article');
    const text = document.createElement('span');
    element.appendChild(text);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(text);

    connectedControllerFor(element, { root: null });

    expect(vi.mocked(draggable).mock.lastCall?.[0].canDrag?.({
      element, dragHandle: null, input: { clientX: 10, clientY: 10 } as never,
    })).toBe(false);
  });

  it('includes the root element in the drag payload', () => {
    const root = document.createElement('div');
    const element = document.createElement('article');
    connectedControllerFor(element, { root: fakeRoot(root) });

    expect(vi.mocked(draggable).mock.lastCall?.[0].getInitialData?.(draggableArgs(element)))
      .toEqual(expect.objectContaining({ itemId: '123', type: 'item', rootElement: root }));
  });

  it('includes the root-resolved source list and confinement in the drag payload', () => {
    const root = document.createElement('div');
    const sourceList = document.createElement('div');
    const element = document.createElement('article');
    connectedControllerFor(element, {
      root: fakeRoot(root, { ownerListElement: sourceList }),
      mobility: 'confined',
    });

    expect(vi.mocked(draggable).mock.lastCall?.[0].getInitialData?.(draggableArgs(element)))
      .toEqual(expect.objectContaining({ sourceListElement: sourceList, confined: true }));
  });

  it('defaults the payload to unconfined with no source list', () => {
    const element = document.createElement('article');
    connectedControllerFor(element);

    expect(vi.mocked(draggable).mock.lastCall?.[0].getInitialData?.(draggableArgs(element)))
      .toEqual(expect.objectContaining({ sourceListElement: null, confined: false }));
  });

  describe('Stimulus application wiring', () => {
    let ctx:StimulusTestContext;
    let fixture:HTMLElement;

    beforeEach(async () => {
      ctx = await setupStimulusTest({
        controllers: {
          'sortable-lists--item': ItemController,
        },
      });
      fixture = ctx.container;
    });

    afterEach(() => {
      ctx.dispose();
    });

    function renderBacklogsRow(itemId = '123', { boxClasses = '' } = {}) {
      const rowHtml = `
        <li
          class="Box-row"
          data-controller="sortable-lists--item"
          data-test-selector="work-package-${itemId}"
          data-sortable-lists--item-id-value="${itemId}"
          data-sortable-lists--item-type-value="work_package"
        >
          <article
            tabindex="0"
            data-controller="backlogs--work-package"
            data-sortable-lists--item-target="preview handle"
            data-action="click->backlogs--work-package#select"
            data-dragging="source"
            data-drop-position="top"
            data-drop-position-owner="${itemId}"
          >
            <span
              data-controller="nested"
              data-action="click->nested#noop"
              data-backlogs--work-package-target="subject"
            ></span>
          </article>
        </li>
      `;

      fixture.innerHTML = boxClasses ? `<ul class="${boxClasses}">${rowHtml}</ul>` : rowHtml;

      return {
        row: fixture.querySelector<HTMLElement>('.Box-row')!,
        article: fixture.querySelector<HTMLElement>('[data-controller="backlogs--work-package"]')!,
      };
    }

    it('registers the row as both draggable and drop target', async () => {
      const { row } = renderBacklogsRow();

      await ctx.nextFrame();

      expect(vi.mocked(draggable)).toHaveBeenCalledWith(expect.objectContaining({
        element: row,
      }));
      expect(vi.mocked(dropTargetForElements)).toHaveBeenCalledWith(expect.objectContaining({
        element: row,
      }));
    });

    it('uses the handle target as the pointer drag handle without adding drag ARIA', async () => {
      const { article } = renderBacklogsRow();

      await ctx.nextFrame();

      expect(vi.mocked(draggable)).toHaveBeenCalledWith(expect.objectContaining({
        dragHandle: article,
      }));
      expect(article.hasAttribute('aria-roledescription')).toBe(false);
      expect(article.hasAttribute('aria-disabled')).toBe(false);
      expect(article.hasAttribute('aria-pressed')).toBe(false);
      expect(article.hasAttribute('role')).toBe(false);
      expect(article.getAttribute('tabindex')).toEqual('0');
      expect(fixture.querySelector('[id^="sortable-lists-drag-handle-instructions"]')).toBeNull();
    });

    it('does not intercept keyboard events on the card handle', async () => {
      const { row, article } = renderBacklogsRow();
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: ' ',
      });

      await ctx.nextFrame();
      article.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(row.hasAttribute('data-dragging')).toBe(false);
    });

    it('builds the sortable item data for the drag payload', async () => {
      const { article } = renderBacklogsRow();

      await ctx.nextFrame();

      expect(vi.mocked(draggable).mock.lastCall?.[0].getInitialData?.(draggableArgs(article))).toEqual(expect.objectContaining({
        itemId: '123',
        type: 'work_package',
      }));
    });

    it('renders a sanitized copy of the preview target for the native drag preview', async () => {
      const { article } = renderBacklogsRow();
      const nativeSetDragImage = vi.fn();
      const previewContainer = document.createElement('div');

      vi.spyOn(article, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 64,
        width: 320,
        height: 64,
        toJSON: vi.fn(),
      });

      await ctx.nextFrame();

      vi.mocked(draggable).mock.lastCall?.[0].onGenerateDragPreview?.({
        ...dragEventPayload(article),
        nativeSetDragImage,
      });

      expect(setCustomNativeDragPreview).toHaveBeenCalledOnce();

      const previewOptions = vi.mocked(setCustomNativeDragPreview).mock.lastCall?.[0] as {
        render:({ container }:{ container:HTMLElement }) => void;
        nativeSetDragImage:typeof nativeSetDragImage;
      };

      expect(previewOptions.nativeSetDragImage).toBe(nativeSetDragImage);

      previewOptions.render({ container: previewContainer });

      const preview = previewContainer.firstElementChild as HTMLElement;

      expect(preview).not.toBe(article);
      expect(preview.tagName).toEqual('ARTICLE');
      expect(preview.style.width).toEqual('320px');
      expect(preview.hasAttribute('data-preview')).toBe(true);
      expect(preview.hasAttribute('data-controller')).toBe(false);
      expect(preview.hasAttribute('data-sortable-lists--item-target')).toBe(false);
      expect(preview.hasAttribute('data-action')).toBe(false);
      expect(preview.hasAttribute('data-dragging')).toBe(false);
      expect(preview.hasAttribute('data-drop-position')).toBe(false);
      expect(preview.hasAttribute('data-drop-position-owner')).toBe(false);
      expect(preview.hasAttribute('aria-roledescription')).toBe(false);
      expect(preview.hasAttribute('aria-describedby')).toBe(false);
      expect(preview.hasAttribute('aria-disabled')).toBe(false);
      expect(preview.querySelector('[data-controller]')).toBeNull();
      expect(preview.querySelector('[data-action]')).toBeNull();
      expect(preview.querySelector('[data-backlogs--work-package-target]')).toBeNull();
    });

    it('renders no batch badge without a connected root', async () => {
      const { article } = renderBacklogsRow();
      const previewContainer = document.createElement('div');

      vi.spyOn(article, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 64, width: 320, height: 64, toJSON: vi.fn(),
      });

      await ctx.nextFrame();

      vi.mocked(draggable).mock.lastCall?.[0].onGenerateDragPreview?.({
        ...dragEventPayload(article),
        nativeSetDragImage: vi.fn(),
      });

      const previewOptions = vi.mocked(setCustomNativeDragPreview).mock.lastCall?.[0] as {
        render:({ container }:{ container:HTMLElement }) => void;
      };
      previewOptions.render({ container: previewContainer });

      expect(previewContainer.querySelector('.op-sortable-lists-drag-preview-batch-badge')).toBeNull();
    });

    it('adds a batch count badge to the preview matching the frozen batch size', async () => {
      const { row, article } = renderBacklogsRow();
      const previewContainer = document.createElement('div');

      vi.spyOn(article, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 64, width: 320, height: 64, toJSON: vi.fn(),
      });

      await ctx.nextFrame();

      const controller = ctx.getController<InstanceType<typeof ItemControllerType>>('sortable-lists--item', row);
      controller.connectRoot({
        element: row,
        busy: false,
        actionScopeFor: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
        selectForAction: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
        prepareActionMenu: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
        availableDestinations: vi.fn(() => []),
        moveToDestination: vi.fn(),
        moveInDirection: vi.fn(),
        moveAvailability: vi.fn(() => null),
        ownerListElementOf: vi.fn(() => null),
        ownerRowsContainer: vi.fn(() => null),
        beginDragBatch: vi.fn(),
        activeDragBatchCount: vi.fn(() => 3),
      });

      vi.mocked(draggable).mock.lastCall?.[0].onGenerateDragPreview?.({
        ...dragEventPayload(article),
        nativeSetDragImage: vi.fn(),
      });

      const previewOptions = vi.mocked(setCustomNativeDragPreview).mock.lastCall?.[0] as {
        render:({ container }:{ container:HTMLElement }) => void;
      };
      previewOptions.render({ container: previewContainer });

      const badge = previewContainer.querySelector('.op-sortable-lists-drag-preview-batch-badge');
      expect(badge?.textContent).toEqual('3');
    });

    it('offsets the preview so the pointer keeps its grab position on the card', async () => {
      const { article } = renderBacklogsRow();

      vi.spyOn(article, 'getBoundingClientRect').mockReturnValue({
        x: 100,
        y: 200,
        top: 200,
        left: 100,
        right: 420,
        bottom: 264,
        width: 320,
        height: 64,
        toJSON: vi.fn(),
      });

      await ctx.nextFrame();

      vi.mocked(draggable).mock.lastCall?.[0].onGenerateDragPreview?.({
        ...dragEventPayload(article),
        location: { current: { input: { clientX: 140, clientY: 230 } } } as never,
        nativeSetDragImage: vi.fn(),
      });

      const previewOptions = vi.mocked(setCustomNativeDragPreview).mock.lastCall?.[0] as {
        getOffset:(args:{ container:HTMLElement }) => { x:number; y:number };
      };
      const container = document.createElement('div');

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 64,
        width: 320,
        height: 64,
        toJSON: vi.fn(),
      });

      expect(previewOptions.getOffset({ container })).toEqual({ x: 40, y: 30 });
    });

    // A batch preview pads the container's top so the badge overhang stays
    // inside its border box (see renderDragPreview), shifting the card down
    // by that padding; the grab offset must shift with it or the pointer
    // lands above the grabbed point. Rendered through the real preview so
    // the padding measured here is the one renderDragPreview writes.
    it('extends the grab offset by the batch container padding', async () => {
      const { row, article } = renderBacklogsRow();

      vi.spyOn(article, 'getBoundingClientRect').mockReturnValue({
        x: 100,
        y: 200,
        top: 200,
        left: 100,
        right: 420,
        bottom: 264,
        width: 320,
        height: 64,
        toJSON: vi.fn(),
      });

      await ctx.nextFrame();

      const controller = ctx.getController<InstanceType<typeof ItemControllerType>>('sortable-lists--item', row);
      controller.connectRoot({
        element: row,
        busy: false,
        moveInDirection: vi.fn(),
        moveAvailability: vi.fn(() => null),
        ownerListElementOf: vi.fn(() => null),
        ownerRowsContainer: vi.fn(() => null),
        beginDragBatch: vi.fn(),
        activeDragBatchCount: vi.fn(() => 3),
      });

      vi.mocked(draggable).mock.lastCall?.[0].onGenerateDragPreview?.({
        ...dragEventPayload(article),
        location: { current: { input: { clientX: 140, clientY: 230 } } } as never,
        nativeSetDragImage: vi.fn(),
      });

      const previewOptions = vi.mocked(setCustomNativeDragPreview).mock.lastCall?.[0] as {
        render:({ container }:{ container:HTMLElement }) => void;
        getOffset:(args:{ container:HTMLElement }) => { x:number; y:number };
      };
      const container = document.createElement('div');
      // getComputedStyle resolves to the empty string on a detached element,
      // and Pragmatic always mounts the container before render and offset.
      document.body.appendChild(container);

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 328,
        bottom: 72,
        width: 328,
        height: 72,
        toJSON: vi.fn(),
      });

      try {
        previewOptions.render({ container });

        expect(previewOptions.getOffset({ container })).toEqual({ x: 40, y: 38 });
      } finally {
        container.remove();
      }
    });

    function generatePreview(article:HTMLElement):HTMLElement {
      const previewContainer = document.createElement('div');

      vi.mocked(draggable).mock.lastCall?.[0].onGenerateDragPreview?.({
        ...dragEventPayload(article),
        nativeSetDragImage: vi.fn(),
      });

      const previewOptions = vi.mocked(setCustomNativeDragPreview).mock.lastCall?.[0] as {
        render:({ container }:{ container:HTMLElement }) => void;
      };

      previewOptions.render({ container: previewContainer });

      return previewContainer;
    }

    it('copies the Box density variant class onto the preview container', async () => {
      const { article } = renderBacklogsRow('123', { boxClasses: 'Box Box--condensed' });

      await ctx.nextFrame();

      const container = generatePreview(article);

      expect(container.classList.contains('Box--condensed')).toBe(true);
      expect(container.classList.contains('Box--spacious')).toBe(false);
    });

    it('does not add density variant classes for a default-density Box', async () => {
      const { article } = renderBacklogsRow('123', { boxClasses: 'Box' });

      await ctx.nextFrame();

      const container = generatePreview(article);

      expect(container.classList.contains('Box--condensed')).toBe(false);
      expect(container.classList.contains('Box--spacious')).toBe(false);
    });
  });

  describe('move menu', () => {
    let menuCtx:StimulusTestContext|undefined;

    beforeEach(() => {
      window.I18n.store({
        en: {
          js: {
            backlogs: {
              action_menu: {
                selected_work_packages: {
                  one: '1 selected work package',
                  other: '%{count} selected work packages',
                },
              },
            },
          },
        },
      });
    });

    afterEach(() => {
      menuCtx?.dispose();
      menuCtx = undefined;
    });

    // Mounts the element through Stimulus (the same setupStimulusTest harness
    // the file's other wiring tests use), so targets/actions/elements wire the
    // way they do in production rather than being newed up directly.
    async function mountItemController(el:HTMLElement):Promise<InstanceType<typeof ItemControllerType>> {
      menuCtx = await setupStimulusTest({
        controllers: {
          'sortable-lists--item': ItemController,
        },
      });
      menuCtx.container.appendChild(el);
      await menuCtx.nextFrame();

      return menuCtx.getController<InstanceType<typeof ItemControllerType>>('sortable-lists--item', el);
    }

    // Builds an item element containing a fake <action-menu> whose four move
    // items are <li> targets (direction + move action on the li). Optional
    // action groups mirror the stable deferred Primer structure. The menu
    // stub exposes the Primer item-state API the controller calls;
    // isItemDisabled is driven by a live class check so the click-guard test
    // is realistic.
    interface FakeActionMenu {
      enableItem:ReturnType<typeof vi.fn>;
      disableItem:ReturnType<typeof vi.fn>;
      showItem:ReturnType<typeof vi.fn>;
      hideItem:ReturnType<typeof vi.fn>;
      isItemDisabled:ReturnType<typeof vi.fn>;
      isItemHidden:ReturnType<typeof vi.fn>;
    }

    function actionGroupsMarkup(idNumber:number, includeSelectedGroup = true):string {
      const thisHeadingId = `this-work-package-heading-${idNumber}`;
      const selectedHeadingId = `selected-work-packages-heading-${idNumber}`;

      return [
        `<div hidden data-sortable-lists--item-target="invokerHeading"><div id="${thisHeadingId}">This work package</div></div>`,
        `<ul aria-labelledby="${thisHeadingId}" data-sortable-lists--item-target="invokerGroup"><li>Open details</li></ul>`,
        ...(includeSelectedGroup ? [
          `<div hidden data-i18n-key="js.backlogs.action_menu.selected_work_packages" data-sortable-lists--item-target="batchHeading"><div id="${selectedHeadingId}">0 selected work packages</div></div>`,
          `<ul aria-labelledby="${selectedHeadingId}" data-sortable-lists--item-target="batchGroup"></ul>`,
        ] : []),
      ].join('');
    }

    function renderItemWithMenu(
      idNumber:number,
      actionGroups:false|true|'singular' = false,
    ):{ el:HTMLElement; menu:FakeActionMenu } {
      const el = document.createElement('div');
      el.dataset.controller = 'sortable-lists--item';
      el.setAttribute('data-sortable-lists--item-id-value', String(idNumber));
      el.setAttribute('data-sortable-lists--item-type-value', 'work_package');

      const menuElement = document.createElement('action-menu');
      if (actionGroups) {
        menuElement.innerHTML = actionGroupsMarkup(idNumber, actionGroups === true);
      }
      const parent = document.createElement('li');
      parent.setAttribute('data-sortable-lists--item-target', 'moveMenu');
      parent.innerHTML = ['top', 'up', 'down', 'bottom'].map((direction) => (
        `<li data-sortable-lists--item-target="moveItem" data-sortable-lists--item-direction-param="${direction}"`
        + ' data-action="click->sortable-lists--item#move"><button></button></li>'
      )).join('');
      if (actionGroups !== 'singular') {
        const selectedGroup = menuElement.querySelector('[data-sortable-lists--item-target="batchGroup"]');
        (selectedGroup ?? menuElement).appendChild(parent);
      }
      el.appendChild(menuElement);

      const menu:FakeActionMenu = {
        enableItem: vi.fn((li:Element|null) => li?.classList.remove('ActionListItem--disabled')),
        disableItem: vi.fn((li:Element|null) => li?.classList.add('ActionListItem--disabled')),
        // Primer's own implementations, so the hidden attribute the divider
        // check reads is as real here as the disabled class above.
        showItem: vi.fn((li:Element|null) => li?.removeAttribute('hidden')),
        hideItem: vi.fn((li:Element|null) => li?.setAttribute('hidden', 'hidden')),
        isItemDisabled: vi.fn((li:Element|null) => !!li?.classList.contains('ActionListItem--disabled')),
        isItemHidden: vi.fn((li:Element|null) => !!li?.hasAttribute('hidden')),
      };
      Object.assign(menuElement, menu);

      return { el, menu };
    }

    const liFor = (el:HTMLElement, direction:string) => el.querySelector<HTMLElement>(`li[data-sortable-lists--item-direction-param="${direction}"]`)!;
    const destinationWithMetadata = (el:HTMLElement, metadata:string) => {
      const item = document.createElement('li');
      item.setAttribute('data-sortable-lists--item-target', 'destinationItem');
      item.dataset.sortableListsDestinations = metadata;
      const destinationParent = el.querySelector('[data-sortable-lists--item-target="batchGroup"]')
        ?? el.querySelector('action-menu')!;
      destinationParent.prepend(item);
      return item;
    };
    const destinationFor = (el:HTMLElement, candidates:{ type:string; id:string|null }[]) => (
      destinationWithMetadata(el, JSON.stringify(candidates))
    );
    // Availability defaults to the first/last extremes so the position-driven
    // specs read naturally; individual tests can override the map to exercise
    // the marker-aware (truncated list) wiring.
    const availabilityFromPosition = (position:{ isFirst:boolean; isLast:boolean }) => ({
      top: !position.isFirst,
      up: !position.isFirst,
      down: !position.isLast,
      bottom: !position.isLast,
    });
    const stubRoot = (
      el:HTMLElement,
      position:{ isFirst:boolean; isLast:boolean },
      moveInDirection = vi.fn(),
      availability = availabilityFromPosition(position),
    ) => ({
      element: el,
      busy: false,
      actionScopeFor: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
      selectForAction: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
      prepareActionMenu: vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] })),
      availableDestinations: vi.fn(() => []),
      moveToDestination: vi.fn(),
      moveAvailability: () => availability,
      moveInDirection,
    } as unknown as SortableListsRoot);

    function stubMenuRoot(el:HTMLElement, position:{ isFirst:boolean; isLast:boolean }) {
      const actionScopeFor = vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] }));
      const selectForAction = vi.fn((item:HTMLElement):ActionScope => ({ kind: 'singular', invoker: item, items: [], ids: [] }));
      const availableDestinations = vi.fn((_scope:ActionScope, _candidates:DestinationIdentity[]):DestinationIdentity[] => []);
      const moveToDestination = vi.fn();
      const moveInDirection = vi.fn();
      const root = {
        ...stubRoot(el, position, moveInDirection),
        actionScopeFor,
        selectForAction,
        availableDestinations,
        moveToDestination,
      };

      return {
        root,
        actionScopeFor,
        selectForAction,
        availableDestinations,
        moveToDestination,
        moveInDirection,
      };
    }

    const actionTarget = (el:HTMLElement, name:string) => (
      el.querySelector<HTMLElement>(`[data-sortable-lists--item-target="${name}"]`)!
    );

    async function mountActionMenuInvocationFixture() {
      const { el } = renderItemWithMenu(1);
      const card = document.createElement('article');
      card.setAttribute('data-sortable-lists--item-target', 'focus');
      const actionMenu = el.querySelector<HTMLElement>('action-menu')!;
      const popover = document.createElement('anchored-position');
      popover.setAttribute('popover', '');
      Object.assign(actionMenu, { popoverElement: popover });
      actionMenu.append(popover);
      card.append(actionMenu);
      el.append(card);
      destinationFor(el, [{ type: 'inbox', id: null }]);
      document.body.appendChild(el);

      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1'] };
      const sequence:string[] = [];
      const prepareActionMenu = vi.fn(() => {
        sequence.push('prepare');
        return scope;
      });
      const availableDestinations = vi.fn((projectedScope:ActionScope, candidates:DestinationIdentity[]) => {
        sequence.push(`project:${projectedScope.ids.join(',')}`);
        return candidates;
      });
      const root = {
        ...stubRoot(el, { isFirst: true, isLast: true }),
        prepareActionMenu,
        availableDestinations,
      };
      controller.connectRoot(root);
      await menuCtx!.nextFrame();
      sequence.length = 0;
      prepareActionMenu.mockClear();
      availableDestinations.mockClear();

      return {
        el,
        card,
        popover,
        controller,
        root,
        scope,
        sequence,
        prepareActionMenu,
        availableDestinations,
      };
    }

    it.each([
      ['pointer context menu', 'pointer'],
      ['Context Menu key', 'keyboard'],
      ['Shift+F10', 'keyboard'],
    ])('settles action scope before projecting a %s invocation', async (_label, origin) => {
      const {
        el, card, scope, sequence, prepareActionMenu, availableDestinations,
      } = await mountActionMenuInvocationFixture();

      card.dispatchEvent(new CustomEvent('contextual-action-menu:beforeOpen', {
        bubbles: true,
        cancelable: true,
        detail: { origin },
      }));

      expect(prepareActionMenu).toHaveBeenCalledWith(el);
      expect(availableDestinations).toHaveBeenCalledWith(scope, [{ type: 'inbox', id: null }]);
      expect(sequence).toEqual(['prepare', 'project:1']);
    });

    it.each([
      'More button pointer invocation',
      'More button keyboard invocation',
    ])('settles action scope before projecting a %s', async () => {
      const {
        el, popover, scope, sequence, prepareActionMenu, availableDestinations,
      } = await mountActionMenuInvocationFixture();

      popover.dispatchEvent(new ToggleEvent('beforetoggle', {
        oldState: 'closed',
        newState: 'open',
      }));

      expect(prepareActionMenu).toHaveBeenCalledWith(el);
      expect(availableDestinations).toHaveBeenCalledWith(scope, [{ type: 'inbox', id: null }]);
      expect(sequence).toEqual(['prepare', 'project:1']);
    });

    it('ignores closing and unrelated popover pre-toggle events', async () => {
      const { card, popover, prepareActionMenu } = await mountActionMenuInvocationFixture();
      const tooltip = document.createElement('div');
      tooltip.setAttribute('popover', '');
      card.append(tooltip);

      popover.dispatchEvent(new ToggleEvent('beforetoggle', {
        oldState: 'open',
        newState: 'closed',
      }));
      tooltip.dispatchEvent(new ToggleEvent('beforetoggle', {
        oldState: 'closed',
        newState: 'open',
      }));

      expect(prepareActionMenu).not.toHaveBeenCalled();
    });

    it('does nothing when a pre-open event arrives after its root disconnects', async () => {
      const {
        controller, card, popover, prepareActionMenu,
      } = await mountActionMenuInvocationFixture();
      controller.disconnectRoot();

      card.dispatchEvent(new CustomEvent('contextual-action-menu:beforeOpen', {
        bubbles: true,
        cancelable: true,
        detail: { origin: 'pointer' },
      }));
      popover.dispatchEvent(new ToggleEvent('beforetoggle', {
        oldState: 'closed',
        newState: 'open',
      }));

      expect(prepareActionMenu).not.toHaveBeenCalled();
    });

    it('projects one stable scope when contextual and popover pre-open events both arrive', async () => {
      const {
        card, popover, scope, prepareActionMenu, availableDestinations,
      } = await mountActionMenuInvocationFixture();

      card.dispatchEvent(new CustomEvent('contextual-action-menu:beforeOpen', {
        bubbles: true,
        cancelable: true,
        detail: { origin: 'pointer' },
      }));
      popover.dispatchEvent(new ToggleEvent('beforetoggle', {
        oldState: 'closed',
        newState: 'open',
      }));

      expect(prepareActionMenu).toHaveBeenCalledTimes(2);
      expect(availableDestinations).toHaveBeenCalledTimes(2);
      expect(availableDestinations.mock.calls.map(([projectedScope]) => projectedScope)).toEqual([scope, scope]);
    });

    it('handles a contextual pre-open from the item itself when no focus target exists', async () => {
      const { el } = renderItemWithMenu(1);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1'] };
      const prepareActionMenu = vi.fn(() => scope);
      controller.connectRoot({
        ...stubRoot(el, { isFirst: true, isLast: true }),
        prepareActionMenu,
      });

      el.dispatchEvent(new CustomEvent('contextual-action-menu:beforeOpen', {
        bubbles: true,
        cancelable: true,
        detail: { origin: 'pointer' },
      }));

      expect(prepareActionMenu).toHaveBeenCalledWith(el);
    });

    it('hides up/top for a first item and shows the rest', async () => {
      const { el, menu } = renderItemWithMenu(1);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      controller.connectRoot(stubRoot(el, { isFirst: true, isLast: false }));
      controller.moveItemTargetConnected();

      expect(menu.hideItem).toHaveBeenCalledWith(liFor(el, 'top'));
      expect(menu.hideItem).toHaveBeenCalledWith(liFor(el, 'up'));
      expect(menu.showItem).toHaveBeenCalledWith(liFor(el, 'down'));
      expect(menu.showItem).toHaveBeenCalledWith(liFor(el, 'bottom'));
    });

    it('hides a mid-list direction the root reports unavailable (truncation gap)', async () => {
      const { el, menu } = renderItemWithMenu(1);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      // Not an extreme (neither first nor last), but the root deems "down"
      // unavailable because it would cross a hidden block.
      const gappedAvailability = { top: true, up: true, down: false, bottom: true };
      controller.connectRoot(stubRoot(el, { isFirst: false, isLast: false }, vi.fn(), gappedAvailability));
      controller.moveItemTargetConnected();

      expect(menu.hideItem).toHaveBeenCalledWith(liFor(el, 'down'));
      expect(menu.showItem).toHaveBeenCalledWith(liFor(el, 'up'));
    });

    it('disables unavailable items instead of hiding them when hideUnavailable is off', async () => {
      const { el, menu } = renderItemWithMenu(1);
      el.setAttribute('data-sortable-lists--item-hide-unavailable-value', 'false');
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      controller.connectRoot(stubRoot(el, { isFirst: true, isLast: false }));
      controller.moveItemTargetConnected();

      expect(menu.disableItem).toHaveBeenCalledWith(liFor(el, 'top'));
      expect(menu.disableItem).toHaveBeenCalledWith(liFor(el, 'up'));
      expect(menu.enableItem).toHaveBeenCalledWith(liFor(el, 'down'));
      expect(menu.enableItem).toHaveBeenCalledWith(liFor(el, 'bottom'));
      expect(menu.hideItem).not.toHaveBeenCalled();
      expect(menu.showItem).not.toHaveBeenCalled();
    });

    it('hides the parent submenu when nothing is available (single item)', async () => {
      const { el, menu } = renderItemWithMenu(1);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      controller.connectRoot(stubRoot(el, { isFirst: true, isLast: true }));
      controller.moveItemTargetConnected();

      const parent = el.querySelector<HTMLElement>('li[data-sortable-lists--item-target="moveMenu"]')!;
      expect(menu.hideItem).toHaveBeenCalledWith(parent);
    });

    it('keeps headings hidden for a one-card scope while its valid actions stay visible', async () => {
      const { el } = renderItemWithMenu(1, true);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockImplementation((_scope, candidates) => candidates);
      controller.connectRoot(root);

      const destination = destinationFor(el, [{ type: 'sprint', id: '1' }]);
      await menuCtx!.nextFrame();

      expect(actionTarget(el, 'invokerHeading')).toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchHeading')).toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchGroup')).not.toHaveAttribute('hidden');
      expect(destination).not.toHaveAttribute('hidden');
      expect(actionTarget(el, 'moveMenu')).not.toHaveAttribute('hidden');
    });

    it('hides the batch group for a one-card scope with no executable actions', async () => {
      const { el } = renderItemWithMenu(1, true);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: true, isLast: true });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockReturnValue([]);
      root.moveAvailability = () => ({ top: false, up: false, down: false, bottom: false });
      controller.connectRoot(root);

      destinationFor(el, [{ type: 'sprint', id: '1' }]);
      await menuCtx!.nextFrame();

      expect(actionTarget(el, 'batchHeading')).toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchGroup')).toHaveAttribute('hidden');
    });

    it('projects generic group labels across one-card and true-batch scopes', async () => {
      const { el } = renderItemWithMenu(1);
      const invokerHeadingId = 'invoker-heading-1';
      const batchHeadingId = 'batch-heading-1';
      el.querySelector('action-menu')!.insertAdjacentHTML('afterbegin', [
        `<div hidden data-sortable-lists--item-target="invokerHeading"><div id="${invokerHeadingId}">This work package</div></div>`,
        `<ul role="group" aria-labelledby="${invokerHeadingId}" data-sortable-lists--item-target="invokerGroup"><li>Open details</li></ul>`,
        `<div hidden data-i18n-key="js.backlogs.action_menu.selected_work_packages" data-sortable-lists--item-target="batchHeading"><div id="${batchHeadingId}">0 selected work packages</div></div>`,
        `<ul role="group" aria-labelledby="${batchHeadingId}" data-sortable-lists--item-target="batchGroup"></ul>`,
      ].join(''));
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const oneCard:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1'] };
      const trueBatch:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1', '2', '3'] };
      let scope = oneCard;
      const { root, actionScopeFor } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockImplementation(() => scope);
      controller.connectRoot(root);
      const menuElement = el.querySelector('action-menu')!;
      menuElement.dispatchEvent(new ToggleEvent('toggle', {
        newState: 'open',
        oldState: 'closed',
      }));
      await menuCtx!.nextFrame();

      const invokerHeading = actionTarget(el, 'invokerHeading');
      const batchHeading = actionTarget(el, 'batchHeading');
      const invokerGroup = actionTarget(el, 'invokerGroup');
      const batchGroup = actionTarget(el, 'batchGroup');
      const batchTitle = document.getElementById(batchHeadingId)!;

      expect(invokerHeading).toHaveAttribute('hidden');
      expect(batchHeading).toHaveAttribute('hidden');
      expect(invokerGroup).not.toHaveAttribute('aria-labelledby');
      expect(batchGroup).not.toHaveAttribute('aria-labelledby');
      expect(invokerGroup).toHaveAccessibleName('');
      expect(batchGroup).toHaveAccessibleName('');

      scope = trueBatch;
      menuElement.dispatchEvent(new ToggleEvent('toggle', {
        newState: 'open',
        oldState: 'closed',
      }));

      expect(invokerHeading).not.toHaveAttribute('hidden');
      expect(batchHeading).not.toHaveAttribute('hidden');
      expect(invokerGroup).toHaveAttribute('aria-labelledby', invokerHeadingId);
      expect(batchGroup).toHaveAttribute('aria-labelledby', batchHeadingId);
      expect(document.getElementById(batchHeadingId)).toBe(batchTitle);
      expect(batchTitle).toHaveTextContent('3 selected work packages');
    });

    it('reveals both headings with the selected count for a true batch', async () => {
      const { el } = renderItemWithMenu(1, true);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1', '2', '3'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockImplementation((_scope, candidates) => candidates);
      controller.connectRoot(root);

      const selectedHeading = actionTarget(el, 'batchHeading');
      const selectedGroup = actionTarget(el, 'batchGroup');
      const selectedTitleId = selectedGroup.getAttribute('aria-labelledby')!;
      const selectedTitle = document.getElementById(selectedTitleId)!;

      destinationFor(el, [{ type: 'sprint', id: '1' }]);
      await menuCtx!.nextFrame();

      expect(actionTarget(el, 'invokerHeading')).not.toHaveAttribute('hidden');
      expect(selectedHeading).not.toHaveAttribute('hidden');
      expect(selectedGroup).not.toHaveAttribute('hidden');
      expect(selectedGroup).toHaveAttribute('aria-labelledby', selectedTitleId);
      expect(document.getElementById(selectedTitleId)).toBe(selectedTitle);
      expect(selectedHeading).toContainElement(selectedTitle);
      expect(selectedTitle).toHaveTextContent('3 selected work packages');
    });

    it('keeps the selected-work-packages group visible with only a destination action', async () => {
      const { el } = renderItemWithMenu(1, true);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1', '2'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockImplementation((_scope, candidates) => candidates);
      root.moveAvailability = () => ({ top: false, up: false, down: false, bottom: false });
      controller.connectRoot(root);

      const destination = destinationFor(el, [{ type: 'sprint', id: '1' }]);
      await menuCtx!.nextFrame();

      expect(destination).not.toHaveAttribute('hidden');
      expect(actionTarget(el, 'moveMenu')).toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchGroup')).not.toHaveAttribute('hidden');
    });

    it('projects deferred destination items for the selected invoker', async () => {
      const { el, menu } = renderItemWithMenu(1, true);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockImplementation((_scope, candidates) => (
        candidates.filter((candidate) => candidate.type === 'inbox')
      ));
      controller.connectRoot(root);

      const moveToSprint = destinationFor(el, [{ type: 'sprint', id: '1' }]);
      const moveToInbox = destinationFor(el, [{ type: 'inbox', id: null }]);
      await menuCtx!.nextFrame();

      expect(actionScopeFor).toHaveBeenCalledWith(el);
      expect(menu.hideItem).toHaveBeenCalledWith(moveToSprint);
      expect(menu.showItem).toHaveBeenCalledWith(moveToInbox);
    });

    it('projects headings and group visibility when deferred targets connect after the root', async () => {
      const { el } = renderItemWithMenu(1);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1', '2', '3'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockImplementation((_scope, candidates) => candidates);
      controller.connectRoot(root);

      const actionMenu = el.querySelector('action-menu')!;
      actionMenu.insertAdjacentHTML('afterbegin', actionGroupsMarkup(1));
      destinationFor(el, [{ type: 'inbox', id: null }]);
      await menuCtx!.nextFrame();

      expect(actionTarget(el, 'invokerHeading')).not.toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchHeading')).not.toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchHeading')).toHaveTextContent('3 selected work packages');
      expect(actionTarget(el, 'batchGroup')).not.toHaveAttribute('hidden');
    });

    it('recomputes selected multi-card and prospective one-card scopes whenever the menu opens', async () => {
      const { el, menu } = renderItemWithMenu(1);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      const selectedPeer = document.createElement('div');
      selectedPeer.setAttribute('data-sortable-lists--item-id-value', '2');
      selectedPeer.setAttribute('data-sortable-lists--item-mobility-value', 'free');
      const selectedScope:ActionScope = { kind: 'batch', invoker: el, items: [el, selectedPeer], ids: ['1', '2'] };
      const prospectiveScope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1'] };
      let activeScope = selectedScope;
      actionScopeFor.mockImplementation(() => activeScope);
      availableDestinations.mockImplementation((scope, candidates) => (
        candidates.filter((candidate) => candidate.type === (scope === selectedScope ? 'sprint' : 'inbox'))
      ));
      controller.connectRoot(root);

      const moveToSprint = destinationFor(el, [{ type: 'sprint', id: '1' }]);
      const moveToInbox = destinationFor(el, [{ type: 'inbox', id: null }]);
      await menuCtx!.nextFrame();

      expect(availableDestinations).toHaveBeenCalledWith(selectedScope, [{ type: 'sprint', id: '1' }]);
      expect(availableDestinations).toHaveBeenCalledWith(selectedScope, [{ type: 'inbox', id: null }]);
      expect(menu.showItem).toHaveBeenCalledWith(moveToSprint);
      expect(menu.hideItem).toHaveBeenCalledWith(moveToInbox);
      menu.hideItem.mockClear();
      menu.showItem.mockClear();
      activeScope = prospectiveScope;

      const menuElement = el.querySelector('action-menu')!;
      const toggle = new ToggleEvent('toggle', { newState: 'open', oldState: 'closed' });
      menuElement.dispatchEvent(toggle);

      expect(actionScopeFor).toHaveBeenLastCalledWith(el);
      expect(availableDestinations).toHaveBeenCalledWith(prospectiveScope, [{ type: 'sprint', id: '1' }]);
      expect(availableDestinations).toHaveBeenCalledWith(prospectiveScope, [{ type: 'inbox', id: null }]);
      expect(menu.hideItem).toHaveBeenCalledWith(moveToSprint);
      expect(menu.showItem).toHaveBeenCalledWith(moveToInbox);
    });

    it('shows available batch position directions when every destination action is hidden', async () => {
      const { el, menu } = renderItemWithMenu(1, true);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1', '2'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockReturnValue([]);
      root.moveAvailability = () => ({ top: false, up: true, down: true, bottom: false });
      controller.connectRoot(root);

      const moveToSprint = destinationFor(el, [{ type: 'sprint', id: '1' }]);
      const moveToInbox = destinationFor(el, [{ type: 'inbox', id: null }]);
      await menuCtx!.nextFrame();

      const moveMenu = el.querySelector<HTMLElement>('li[data-sortable-lists--item-target="moveMenu"]')!;
      expect(menu.hideItem).toHaveBeenCalledWith(moveToSprint);
      expect(menu.hideItem).toHaveBeenCalledWith(moveToInbox);
      expect(menu.showItem).toHaveBeenCalledWith(moveMenu);
      expect(menu.hideItem).toHaveBeenCalledWith(liFor(el, 'top'));
      expect(menu.showItem).toHaveBeenCalledWith(liFor(el, 'up'));
      expect(menu.showItem).toHaveBeenCalledWith(liFor(el, 'down'));
      expect(menu.hideItem).toHaveBeenCalledWith(liFor(el, 'bottom'));
      expect(actionTarget(el, 'batchGroup')).not.toHaveAttribute('hidden');
    });

    it('hides an all-unavailable batch position submenu and its directions', async () => {
      const { el, menu } = renderItemWithMenu(1, true);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1', '3'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockReturnValue([]);
      root.moveAvailability = () => ({ top: false, up: false, down: false, bottom: false });
      controller.connectRoot(root);

      const moveToSprint = destinationFor(el, [{ type: 'sprint', id: '1' }]);
      await menuCtx!.nextFrame();

      const moveMenu = el.querySelector<HTMLElement>('li[data-sortable-lists--item-target="moveMenu"]')!;
      expect(menu.hideItem).toHaveBeenCalledWith(moveToSprint);
      expect(menu.hideItem).toHaveBeenCalledWith(moveMenu);
      for (const direction of ['top', 'up', 'down', 'bottom']) {
        expect(menu.hideItem).toHaveBeenCalledWith(liFor(el, direction));
      }
      expect(actionTarget(el, 'batchHeading')).toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchGroup')).toHaveAttribute('hidden');
    });

    it('hides an all-unavailable true-batch group in disable mode', async () => {
      const { el, menu } = renderItemWithMenu(1, true);
      el.setAttribute('data-sortable-lists--item-hide-unavailable-value', 'false');
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1', '3'] };
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockReturnValue([]);
      root.moveAvailability = () => ({ top: false, up: false, down: false, bottom: false });
      controller.connectRoot(root);

      const moveToSprint = destinationFor(el, [{ type: 'sprint', id: '1' }]);
      await menuCtx!.nextFrame();

      expect(menu.disableItem).toHaveBeenCalledWith(moveToSprint);
      expect(actionTarget(el, 'batchHeading')).toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchGroup')).toHaveAttribute('hidden');
    });

    it('keeps only the current owner destination for a confined batch scope', async () => {
      const { el, menu } = renderItemWithMenu(1);
      el.setAttribute('data-sortable-lists--item-mobility-value', 'confined');
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const { root, actionScopeFor, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      const scope:ActionScope = { kind: 'batch', invoker: el, items: [el], ids: ['1'] };
      actionScopeFor.mockReturnValue(scope);
      availableDestinations.mockImplementation((_scope, candidates) => candidates.filter((candidate) => candidate.id === '12'));
      controller.connectRoot(root);

      const moveToSprint = destinationFor(el, [{ type: 'sprint', id: '12' }, { type: 'sprint', id: '13' }]);
      await menuCtx!.nextFrame();

      expect(availableDestinations).toHaveBeenCalledWith(scope, [{ type: 'sprint', id: '12' }, { type: 'sprint', id: '13' }]);
      expect(menu.showItem).toHaveBeenCalledWith(moveToSprint);
    });

    it('handles a fixed singular item with no batch action group', async () => {
      const { el } = renderItemWithMenu(1, 'singular');
      el.setAttribute('data-sortable-lists--item-mobility-value', 'fixed');
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const { root, actionScopeFor } = stubMenuRoot(el, { isFirst: false, isLast: false });
      const scope:ActionScope = { kind: 'singular', invoker: el, items: [], ids: [] };
      actionScopeFor.mockReturnValue(scope);
      controller.connectRoot(root);

      expect(() => controller.moveItemTargetConnected()).not.toThrow();

      expect(actionTarget(el, 'invokerHeading')).toHaveAttribute('hidden');
      expect(el.querySelector('[data-sortable-lists--item-target="batchGroup"]')).toBeNull();
      expect(el.querySelector('[data-sortable-lists--item-target="batchHeading"]')).toBeNull();
    });

    it('hides a stale batch action skeleton for a fixed singular invoker', async () => {
      const { el } = renderItemWithMenu(1, true);
      el.setAttribute('data-sortable-lists--item-mobility-value', 'fixed');
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const {
        root,
        actionScopeFor,
        selectForAction,
        availableDestinations,
        moveToDestination,
        moveInDirection,
      } = stubMenuRoot(el, { isFirst: false, isLast: false });
      const scope:ActionScope = { kind: 'singular', invoker: el, items: [], ids: [] };
      actionScopeFor.mockReturnValue(scope);
      // Keep the collaborators deliberately permissive: the item controller
      // must project the already-settled singular scope, not let stale batch
      // markup look actionable while the root's defences would reject it.
      availableDestinations.mockImplementation((_scope, candidates) => candidates);
      controller.connectRoot(root);

      const destination = destinationFor(el, [{ type: 'sprint', id: '1' }]);
      await menuCtx!.nextFrame();

      expect(actionTarget(el, 'invokerHeading')).toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchHeading')).toHaveAttribute('hidden');
      expect(actionTarget(el, 'batchGroup')).toHaveAttribute('hidden');
      expect(destination).toHaveAttribute('hidden');
      expect(actionTarget(el, 'moveMenu')).toHaveAttribute('hidden');

      liFor(el, 'down').click();
      const destinationEvent = new Event('click') as ActionEvent;
      Object.defineProperty(destinationEvent, 'currentTarget', { value: destination });
      controller.moveToDestination(destinationEvent);

      expect(moveInDirection).not.toHaveBeenCalled();
      expect(moveToDestination).not.toHaveBeenCalled();
      expect(selectForAction).not.toHaveBeenCalled();
    });

    it.each([
      ['invalid JSON', '{invalid'],
      ['non-array JSON', '{"type":"sprint","id":"12"}'],
      ['a malformed candidate member', '[{"type":"sprint","id":"12"},{"type":"sprint"}]'],
    ])('fails closed for %s destination metadata', async (_description, metadata) => {
      const { el, menu } = renderItemWithMenu(1);
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const { root, availableDestinations } = stubMenuRoot(el, { isFirst: false, isLast: false });
      controller.connectRoot(root);

      const destination = destinationWithMetadata(el, metadata);
      await menuCtx!.nextFrame();

      expect(menu.hideItem).toHaveBeenCalledWith(destination);
      expect(availableDestinations).not.toHaveBeenCalled();
    });

    it('delegates an enabled click to the root and no-ops a disabled one', async () => {
      const { el } = renderItemWithMenu(2);
      document.body.appendChild(el);
      const moveInDirection = vi.fn();
      const controller = await mountItemController(el);
      controller.connectRoot(stubRoot(el, { isFirst: false, isLast: false }, moveInDirection));
      controller.moveItemTargetConnected();

      liFor(el, 'down').click();
      expect(moveInDirection).toHaveBeenCalledWith(el, 'down');

      liFor(el, 'up').classList.add('ActionListItem--disabled'); // menu.isItemDisabled now returns true for it
      moveInDirection.mockClear();
      liFor(el, 'up').click();
      expect(moveInDirection).not.toHaveBeenCalled();
    });

    it('does nothing when there is no action-menu (drag-only consumer)', async () => {
      const el = document.createElement('div');
      el.dataset.controller = 'sortable-lists--item';
      el.setAttribute('data-sortable-lists--item-id-value', '1');
      el.setAttribute('data-sortable-lists--item-type-value', 'work_package');
      document.body.appendChild(el);
      const controller = await mountItemController(el);
      const moveInDirection = vi.fn();

      // No moveItem targets and no <action-menu>: the availability refresh
      // must no-op, not throw.
      expect(() => {
        controller.connectRoot(stubRoot(el, { isFirst: true, isLast: true }, moveInDirection));
        // @ts-expect-error exercising the guard directly
        controller.refreshActionAvailability?.();
      }).not.toThrow();

      // move() must also no-op rather than throw: there is no menu to read
      // isItemDisabled/isItemHidden from, and no move should reach the root.
      const moveEvent:ActionEvent = Object.assign(new Event('click'), { params: {} });
      Object.defineProperty(moveEvent, 'currentTarget', { value: el });

      expect(() => controller.move(moveEvent)).not.toThrow();
      expect(moveInDirection).not.toHaveBeenCalled();
    });
  });

  describe('destination activation', () => {
    it('exposes direct destination movement as a required root capability', () => {
      const moveToDestination = vi.fn();
      const root:SortableListsRoot = { ...fakeRoot(), moveToDestination };
      const item = document.createElement('div');

      root.moveToDestination(item, { type: 'inbox', id: null });

      expect(moveToDestination).toHaveBeenCalledWith(item, { type: 'inbox', id: null });
    });

    it('replaces stale generated inputs with the current action scope in document order', () => {
      const element = document.createElement('div');
      const selectForAction = vi.fn(():ActionScope => ({
        kind: 'batch', invoker: element, items: [element], ids: ['2', '1'],
      }));
      const controller = connectedControllerFor(element, {
        root: { ...fakeRoot(), selectForAction },
      });
      const form = document.createElement('form');
      form.innerHTML = '<input name="ids[]" value="stale" data-sortable-lists-generated-id><input name="kept" value="yes">';
      const event = new CustomEvent('async-dialog:beforeLoad', {
        cancelable: true,
        detail: { form },
      });

      controller.prepareDialog(event);

      expect(selectForAction).toHaveBeenCalledWith(element);
      expect(event.defaultPrevented).toBe(false);
      expect(Array.from(form.elements).map((input) => [(input as HTMLInputElement).name, (input as HTMLInputElement).value])).toEqual([
        ['kept', 'yes'],
        ['ids[]', '2'],
        ['ids[]', '1'],
      ]);
      expect(form.querySelectorAll('[data-sortable-lists-generated-id]')).toHaveLength(2);
    });

    it('cancels dialog loading for a fixed invoker with no batch action scope', () => {
      const element = document.createElement('div');
      element.setAttribute('data-sortable-lists--item-mobility-value', 'fixed');
      const selectForAction = vi.fn(():ActionScope => ({ kind: 'singular', invoker: element, items: [], ids: [] }));
      const controller = connectedControllerFor(element, {
        root: { ...fakeRoot(), selectForAction },
      });
      const form = document.createElement('form');
      const event = new CustomEvent('async-dialog:beforeLoad', {
        cancelable: true,
        detail: { form },
      });

      controller.prepareDialog(event);

      expect(selectForAction).toHaveBeenCalledWith(element);
      expect(event.defaultPrevented).toBe(true);
      expect(form.querySelector('[name="ids[]"]')).toBeNull();
    });

    it('delegates direct destination metadata to the root', () => {
      const element = document.createElement('div');
      const moveToDestination = vi.fn();
      const controller = connectedControllerFor(element, {
        root: { ...fakeRoot(), moveToDestination },
      });
      Object.defineProperty(controller, 'hasMenuElement', { value: true });
      Object.defineProperty(controller, 'menuElement', {
        value: { isItemDisabled: vi.fn(() => false), isItemHidden: vi.fn(() => false) },
      });
      const item = document.createElement('li');
      item.dataset.sortableListsDestinations = '[{"type":"inbox","id":null}]';
      const event = new Event('click') as ActionEvent;
      Object.defineProperty(event, 'currentTarget', { value: item });

      controller.moveToDestination(event);

      expect(moveToDestination).toHaveBeenCalledWith(element, { type: 'inbox', id: null });
    });
  });

  describe('movability and focus', () => {
    let ctx:StimulusTestContext;

    afterEach(() => {
      ctx?.dispose();
    });

    // Mounts a minimal item row through the real Stimulus lifecycle, the same
    // way renderBacklogsRow and mountItemController do above, so mobility and
    // the focus target come from real value/target wiring rather than stubbed
    // properties. Omitting `mobility` renders no attribute at all, exercising
    // the free default. The root carries a tabindex so the no-focus-target
    // case has something focusable to land on, the way a consumer that makes
    // the row itself focusable would render it.
    async function renderItem(
      { mobility, withFocusTarget = false }:{ mobility?:string; withFocusTarget?:boolean } = {},
    ):Promise<HTMLElement> {
      ctx = await setupStimulusTest({
        controllers: {
          'sortable-lists--item': ItemController,
        },
      });

      const mobilityAttr = mobility === undefined ? '' : ` data-sortable-lists--item-mobility-value="${mobility}"`;
      const focusTargetHtml = withFocusTarget
        ? '<button type="button" data-sortable-lists--item-target="focus">Focus me</button>'
        : '';

      await ctx.mount(`
        <li
          tabindex="0"
          data-controller="sortable-lists--item"
          data-sortable-lists--item-id-value="1"
          data-sortable-lists--item-type-value="work_package"${mobilityAttr}
        >${focusTargetHtml}</li>
      `);

      return ctx.container.querySelector<HTMLElement>('[data-controller="sortable-lists--item"]')!;
    }

    function controllerFor(element:HTMLElement) {
      return ctx.getController<InstanceType<typeof ItemControllerType>>('sortable-lists--item', element);
    }

    it('registers a draggable when the item takes part in ordering', async () => {
      const item = await renderItem({ mobility: 'free' });

      expect(item.hasAttribute('draggable')).toBe(true);
    });

    it('does not register a draggable when the item is fixed', async () => {
      const item = await renderItem({ mobility: 'fixed' });

      expect(item.hasAttribute('draggable')).toBe(false);
    });

    // A fixed row is still an ordered participant: it anchors drops for its
    // orderable neighbours, so its drop target must stay registered.
    it('still registers a drop target when the item is fixed', async () => {
      const item = await renderItem({ mobility: 'fixed' });

      expect(item.hasAttribute('data-drop-target-for-element')).toBe(true);
    });

    it('treats a missing mobility attribute as free', async () => {
      const item = await renderItem({});

      expect(item.hasAttribute('draggable')).toBe(true);
    });

    it('focuses its focus target', async () => {
      const item = await renderItem({ mobility: 'free', withFocusTarget: true });
      const controller = controllerFor(item);

      controller.focusItem();

      expect(document.activeElement).toBe(item.querySelector('[data-sortable-lists--item-target~="focus"]'));
    });

    it('focuses itself when it has no focus target', async () => {
      const item = await renderItem({ mobility: 'free' });
      const controller = controllerFor(item);

      controller.focusItem();

      expect(document.activeElement).toBe(item);
    });

    it('collapses the batch onto the dragged item when a drag starts', async () => {
      const item = await renderItem({ mobility: 'free' });
      const controller = controllerFor(item);
      const beginDragBatch = vi.fn();
      const root:SortableListsRoot = {
        element: item,
        busy: false,
        actionScopeFor: vi.fn((actionItem:HTMLElement):ActionScope => ({ kind: 'singular', invoker: actionItem, items: [], ids: [] })),
        selectForAction: vi.fn((actionItem:HTMLElement):ActionScope => ({ kind: 'singular', invoker: actionItem, items: [], ids: [] })),
        prepareActionMenu: vi.fn((actionItem:HTMLElement):ActionScope => ({ kind: 'singular', invoker: actionItem, items: [], ids: [] })),
        availableDestinations: vi.fn(() => []),
        moveToDestination: vi.fn(),
        moveInDirection: vi.fn(),
        moveAvailability: vi.fn(() => null),
        ownerListElementOf: vi.fn(() => null),
        ownerRowsContainer: vi.fn(() => null),
        beginDragBatch,
        activeDragBatchCount: vi.fn(() => 0),
      };

      controller.connectRoot(root);

      vi.mocked(draggable).mock.lastCall?.[0].onDragStart?.(dragEventPayload(item));

      expect(beginDragBatch).toHaveBeenCalledWith(item);
    });

    // Pragmatic DnD invokes onGenerateDragPreview before onDragStart (native
    // setDragImage must happen during the dragstart event), so the frozen
    // batch has to exist by preview time: beginDragBatch is called at the top
    // of onGenerateDragPreview too, ahead of rendering. Proven here on an
    // item with no preview target, so if the call happened anywhere past the
    // preview-target guard this would still catch it reaching the guard.
    it('begins the drag batch at the top of onGenerateDragPreview, before the preview renders', async () => {
      const item = await renderItem({ mobility: 'free' });
      const controller = controllerFor(item);
      const beginDragBatch = vi.fn();
      const root:SortableListsRoot = {
        element: item,
        busy: false,
        actionScopeFor: vi.fn((actionItem:HTMLElement):ActionScope => ({ kind: 'singular', invoker: actionItem, items: [], ids: [] })),
        selectForAction: vi.fn((actionItem:HTMLElement):ActionScope => ({ kind: 'singular', invoker: actionItem, items: [], ids: [] })),
        prepareActionMenu: vi.fn((actionItem:HTMLElement):ActionScope => ({ kind: 'singular', invoker: actionItem, items: [], ids: [] })),
        availableDestinations: vi.fn(() => []),
        moveToDestination: vi.fn(),
        moveInDirection: vi.fn(),
        moveAvailability: vi.fn(() => null),
        ownerListElementOf: vi.fn(() => null),
        ownerRowsContainer: vi.fn(() => null),
        beginDragBatch,
        activeDragBatchCount: vi.fn(() => 0),
      };

      controller.connectRoot(root);

      vi.mocked(draggable).mock.lastCall?.[0].onGenerateDragPreview?.({
        ...dragEventPayload(item),
        nativeSetDragImage: vi.fn(),
      });

      expect(beginDragBatch).toHaveBeenCalledWith(item);
    });
  });
});
