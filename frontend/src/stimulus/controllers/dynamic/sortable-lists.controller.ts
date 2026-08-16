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

import {
  monitorForElements,
  type ElementEventPayloadMap,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Controller } from '@hotwired/stimulus';
import { FetchRequest } from '@rails/request.js';
import { announce } from '@primer/live-region-element';
import { debugLog } from 'core-app/shared/helpers/debug_output';
import { OPToastEvent } from 'core-app/shared/components/toaster/toast-event';
import { flipMove } from 'core-stimulus/helpers/flip-helper';
import { parseTemplate } from 'url-template';
import {
  buildMoveFormData,
  isSortableItemData,
  resolveDropIntent,
  type RootAwareChild,
  type SortableListData,
  type SortableListsRoot,
} from './sortable-lists/drag-and-drop';
import {
  captureRowPositions,
  isOrderableItem,
  reorderRows,
  resolveDirectionalPreviousItemId,
  resolveItemId,
  resolveItemLabel,
  resolveItemPosition,
  resolveItemType,
  resolveMoveAvailability,
  restoreRowPositions,
  rowOf,
  rowsRemainAt,
  permittedDestinations,
  sameDestination,
  sortableListsBusyAttribute,
  type DestinationIdentity,
  type MoveAvailability,
  type MoveDirection,
} from './sortable-lists/list-dom';
import { SelectionOrchestrator, type ActionScope, type SelectionHost } from './sortable-lists/selection-orchestrator';

type CleanupFn = () => void;
type ElementDropPayload = ElementEventPayloadMap['onDrop'];
type MoveResult = { ok:true }|{ ok:false; showToast:boolean };
interface MoveAnnouncementContext { label:string|null; listName:string|null; crossList:boolean }

export default class SortableListsController extends Controller<HTMLElement> implements SortableListsRoot, SelectionHost {
  static outlets = ['sortable-lists--list', 'sortable-lists--item', 'sortable-lists--scrollable'];

  static values = {
    moveUrlTemplate: String,
    moveUrlTemplates: Object,
    collectionMoveUrl: String,
    optimistic: { type: Boolean, default: false },
    selectionEnabled: { type: Boolean, default: false },
    announcementScope: { type: String, default: 'js.sortable_lists.selection' },
    moveAnnouncementScope: { type: String, default: 'js.sortable_lists.announcements' },
    selectionDescriptionId: { type: String, default: '' },
  };

  declare readonly sortableListsListOutlets:import('./sortable-lists/list.controller').default[];
  declare readonly sortableListsItemOutlets:(RootAwareChild & { focusItem():void })[];
  declare readonly sortableListsScrollableOutlets:RootAwareChild[];

  declare readonly moveUrlTemplateValue:string;
  declare readonly hasMoveUrlTemplateValue:boolean;
  declare readonly moveUrlTemplatesValue:Record<string, string>;
  declare readonly hasMoveUrlTemplatesValue:boolean;
  declare readonly collectionMoveUrlValue:string;
  declare readonly hasCollectionMoveUrlValue:boolean;
  declare readonly optimisticValue:boolean;
  declare readonly selectionEnabledValue:boolean;
  declare readonly announcementScopeValue:string;
  declare readonly moveAnnouncementScopeValue:string;
  declare readonly selectionDescriptionIdValue:string;

  private selection?:SelectionOrchestrator;

  private monitorCleanupFn?:CleanupFn;
  private healScheduled = false;
  private inFlightMoveRequests = 0;


  connect():void {
    // Busy belongs to in-flight controller work, not to cached DOM markup.
    // Reconnecting before settlement keeps the root blocked; reconnecting a
    // stale cached root after settlement clears the marker.
    this.syncBusyState();
    this.monitorCleanupFn = monitorForElements({
      canMonitor: ({ source }) => !this.busy
        && isSortableItemData(source.data)
        && source.data.rootElement === this.element,
      onDrop: (args) => {
        void this.handleDrop(args);
      },
    });
    this.element.addEventListener('turbo:morph-element', this.scheduleRegistrationHeal);

    // Constructed only for a consumer that opted in, and the listeners go up
    // with it. A root that never opted in therefore has nothing attached to
    // swallow a keystroke with, rather than attaching handlers that return
    // early — the difference matters for a viewer, whose Space and arrows
    // must keep scrolling the page.
    if (this.selectionEnabledValue) {
      this.selection = new SelectionOrchestrator(this);
      // Capture phase, at the root: a modified gesture has to be consumed
      // before the card's own navigation listener sees it, and doing that
      // here does not depend on which controller connected first.
      this.element.addEventListener('click', this.onSelectionClick, true);
      this.element.addEventListener('keydown', this.onSelectionKeydown, true);
      // Escape listens at the document, in the bubble phase: clearing the
      // selection must not depend on focus sitting on a card row, and an
      // overlay's own Escape has to run first so it can be respected.
      document.addEventListener('keydown', this.onSelectionEscape);
      // A restored page brings its markup back but not this controller's
      // model, so any batch presentation already in the DOM at connect time
      // is left over from whoever was cached — clear it rather than let it
      // claim a selection nothing holds.
      //
      // Deliberately not `turbo:before-cache`: that fires for every visit,
      // including the details-pane navigation that morphs this page in
      // place. Clearing there strips the highlight from a live page whose
      // controller never went away, which is exactly what AC-7 forbids.
      this.selection.clearPresentation();
    }
  }

  disconnect():void {
    this.element.removeEventListener('turbo:morph-element', this.scheduleRegistrationHeal);
    this.element.removeEventListener('click', this.onSelectionClick, true);
    this.element.removeEventListener('keydown', this.onSelectionKeydown, true);
    document.removeEventListener('keydown', this.onSelectionEscape);
    this.monitorCleanupFn?.();
    this.monitorCleanupFn = undefined;
    this.selection?.teardown();
    this.selection = undefined;
    // Defensive: a drag in flight when the controller disconnects (a Turbo
    // visit navigating away mid-drag) would otherwise leave its marks behind
    // in the cached page.
    this.clearDraggingRows();
  }


  private readonly onSelectionClick = (event:MouseEvent):void => {
    this.selection?.handleClick(event);
  };

  private readonly onSelectionKeydown = (event:KeyboardEvent):void => {
    this.selection?.handleKeydown(event);
  };

  private readonly onSelectionEscape = (event:KeyboardEvent):void => {
    this.selection?.handleEscape(event);
  };

  // SelectionHost. The orchestrator reads root state and asks for focus; it
  // never learns that any of this is Stimulus.
  get rootElement():HTMLElement {
    return this.element;
  }

  get announcementScope():string {
    return this.announcementScopeValue;
  }

  get descriptionId():string {
    return this.selectionDescriptionIdValue;
  }

  // Focus is applied through the item's own outlet so the consumer decides
  // which element inside the row actually holds the tab stop.
  focusItem(target:HTMLElement):void {
    const outlet = this.sortableListsItemOutlets.find((item) => item.element === target);

    if (outlet) {
      outlet.focusItem();
    } else {
      target.focus();
    }
  }

  // Live ordered membership, for AGILE-278's batch move.
  selectedIds():string[] {
    return this.selection?.selectedIds() ?? [];
  }

  actionScopeFor(itemElement:HTMLElement):ActionScope {
    return this.selection?.actionScopeFor(itemElement)
      ?? { kind: 'singular', invoker: itemElement, items: [], ids: [] };
  }

  selectForAction(itemElement:HTMLElement):ActionScope {
    if (this.busy) {
      return this.actionScopeFor(itemElement);
    }

    return this.selection?.selectForAction(itemElement)
      ?? { kind: 'singular', invoker: itemElement, items: [], ids: [] };
  }

  // Consumer-owned non-optimistic forms do not call performMove, so their
  // successful move event is the shared boundary at which the live batch is
  // cleared. Failed requests emit no completion event and keep the selection.
  clearSelectionAfterMove():void {
    this.selection?.clearAfterMove();
  }

  availableDestinations(scope:ActionScope, candidates:DestinationIdentity[]):DestinationIdentity[] {
    if (scope.kind === 'singular') {
      return [];
    }

    const permitted = permittedDestinations({
      items: scope.items,
      candidates,
      ownerDestinationOf: (item) => {
        const listData = this.ownerListOf(item)?.listData;
        return listData ? {
          type: listData.type,
          id: listData.listId == null ? null : String(listData.listId),
        } : null;
      },
    });

    return permitted.filter((target) => !scope.items.every((item) => {
      const listData = this.ownerListOf(item)?.listData;
      const owner = listData ? {
        type: listData.type,
        id: listData.listId == null ? null : String(listData.listId),
      } : null;
      return sameDestination(owner, target);
    }));
  }

  // The batch the active drag represents, frozen at drag start. Consumed
  // exactly once per drop (cancelled ones included) so Escape or a Turbo
  // morph mid-drag can never change what gets submitted, and a stale batch
  // can never leak into the next drag.
  private activeDragBatch:string[]|null = null;

  // Idempotent: Pragmatic calls onGenerateDragPreview before onDragStart, and
  // the item controller calls this at the top of both, so a second call for
  // the same drag must re-mark the same rows rather than compounding or
  // losing them. batchForDrag itself is already idempotent (an unselected
  // card's first call collapses the selection onto it, so the second finds
  // it selected and returns the same one-id batch); re-marking is safe
  // because setAttribute on an already-marked row is a no-op.
  beginDragBatch(itemElement:HTMLElement):void {
    this.activeDragBatch = this.selection?.batchForDrag(itemElement) ?? null;
    this.markDraggingRows(this.activeDragBatch ?? []);
  }

  activeDragBatchCount():number {
    return this.activeDragBatch?.length ?? 0;
  }

  // Every source row the drag represents carries the dragging treatment, on
  // the same element the item controller's own onDragStart marks (the item
  // element itself, not a row resolved above it), so CSS keys off one
  // convention regardless of which controller did the marking.
  private markDraggingRows(itemIds:string[]):void {
    itemIds.forEach((id) => {
      this.itemOutletElementFor(id)?.setAttribute('data-dragging', 'source');
    });
  }

  // Removes every dragging mark under the root, not just the frozen batch's
  // own rows: a batch-mate a mid-drag morph replaced loses the attribute
  // naturally along with the rest of its old element, but stray marks left on
  // rows that survived (or the item controller's own onDrop missing them
  // outright, e.g. a cancelled drop) are not otherwise cleaned up.
  private clearDraggingRows():void {
    this.element.querySelectorAll('[data-dragging]').forEach((element) => element.removeAttribute('data-dragging'));
  }

  private itemOutletElementFor(id:string):HTMLElement|null {
    const outlet = this.sortableListsItemOutlets.find((item) => (
      item.element instanceof HTMLElement
        && this.element.contains(item.element)
        && resolveItemId(item.element) === id
    ));

    return outlet && outlet.element instanceof HTMLElement ? outlet.element : null;
  }

  private takeActiveDragBatch():string[]|null {
    const batch = this.activeDragBatch;
    this.clearDraggingRows();
    this.activeDragBatch = null;
    return batch;
  }

  // A morph desyncs the children's drag-and-drop state in two ways. Stimulus
  // outlet-connected callbacks do not fire reliably for elements a morph
  // replaces, so those children never receive the root reference and refuse
  // every drag and drop (canDrag/canDrop gate on it). And Pragmatic DnD tracks
  // drop targets in both a marker attribute and a WeakMap registration, which
  // a morph can strip or orphan; an element left with the attribute but no
  // registration silently aborts Pragmatic's drop-target search, killing
  // every row rendered underneath it. Re-hand the root and re-register all
  // children once per morph batch — reregistration restores attribute and
  // registration together (which is why the morph attribute preservation
  // deliberately lets the marker be stripped), and the outlet getters query
  // the DOM live, so they see even the children whose connected callbacks
  // were skipped. The microtask runs before any further drag event can
  // observe the desync, so a morph mid-drag stays safe too.
  private scheduleRegistrationHeal = ():void => {
    if (this.healScheduled) {
      return;
    }

    this.healScheduled = true;
    queueMicrotask(() => {
      this.healScheduled = false;
      const children = [
        ...this.sortableListsListOutlets,
        ...this.sortableListsItemOutlets,
        ...this.sortableListsScrollableOutlets,
      ];
      children.forEach((child) => {
        // Outlet selectors are document-scoped, so a broad selector can match
        // another root's children; repair only the ones this root owns.
        if (!this.element.contains(child.element)) {
          return;
        }

        child.connectRoot(this);
        child.reregister();
      });

      // Reconciliation happens once per morph batch rather than per
      // disconnect: a morph can replace a row with a fresh element for the
      // same work package, and reacting to the disconnect alone would drop a
      // member that is about to come straight back.
      // Presentation is re-synced on every morph regardless of whether prune
      // dropped anything: a morph can strip or preserve the marker attribute
      // independently of the model, so the DOM has to be brought back in
      // line either way. Routing through renderSelection rather than calling
      // applySelectionPresentation and renderSelectionCount directly means a
      // prune that actually removes a selected member announces the new
      // count through the same rule as every other selection change, instead
      // of a second, easily-missed announcement path.
      this.selection?.reconcile();

      // A row a morph replaces mid-drag loses data-dragging along with the
      // rest of its old element (see markDraggingRows/clearDraggingRows
      // above), because the replacement is fresh server HTML that never went
      // through beginDragBatch. Re-apply the mark to the frozen batch here so
      // a mid-drag Turbo update never leaves a batch-mate looking undragged.
      // markDraggingRows already tolerates an id it cannot resolve, exactly
      // as beginDragBatch relies on.
      if (this.activeDragBatch) {
        this.markDraggingRows(this.activeDragBatch);
      }
    });
  };

  sortableListsListOutletConnected(list:RootAwareChild):void {
    list.connectRoot(this);
  }

  sortableListsListOutletDisconnected(list:RootAwareChild):void {
    list.disconnectRoot();
  }

  sortableListsItemOutletConnected(item:RootAwareChild):void {
    item.connectRoot(this);
  }

  sortableListsItemOutletDisconnected(item:RootAwareChild):void {
    item.disconnectRoot();
  }

  sortableListsScrollableOutletConnected(scrollable:RootAwareChild):void {
    scrollable.connectRoot(this);
  }

  sortableListsScrollableOutletDisconnected(scrollable:RootAwareChild):void {
    scrollable.disconnectRoot();
  }

  get busy():boolean {
    return this.element.hasAttribute(sortableListsBusyAttribute);
  }

  // Availability mirrors executability: a direction is offered exactly when the
  // move resolver can produce a target for it. This keeps the menu honest about
  // truncated lists, where a one-step move across the hidden block is not
  // addressable. Null means the item is not in an owned list (yet). The result
  // is a snapshot for menu gating; the click path re-resolves the live DOM.
  moveAvailability(itemElement:HTMLElement):MoveAvailability|null {
    const list = this.ownerListOf(itemElement);

    return list ? resolveMoveAvailability({ itemElement, rowsContainer: list.rowsContainer }) : null;
  }

  moveToDestination(itemElement:HTMLElement, target:DestinationIdentity):void {
    if (this.busy) {
      return;
    }

    const moveUrl = this.resolveCollectionMoveUrl(false);
    if (!moveUrl) {
      return;
    }

    const scope = this.selectForAction(itemElement);
    if (scope.kind === 'singular') {
      return;
    }

    const body = new FormData();
    scope.ids.forEach((id) => body.append('ids[]', id));
    body.append('list_type', target.type);
    body.append('list_id', target.id ?? '');

    void this.submitDestinationMove(moveUrl, body);
  }

  moveInDirection(itemElement:HTMLElement, direction:MoveDirection):void {
    // Defence in depth. The menu is rendered server-side from a permission
    // check that does not know about per-work-package movability, so a stale
    // or over-permissive menu must not be able to execute a move the server
    // will refuse.
    if (this.busy || !isOrderableItem(itemElement)) {
      return;
    }

    const list = this.ownerListOf(itemElement);
    if (!list) {
      return;
    }

    const itemId = resolveItemId(itemElement);
    if (!itemId) {
      return;
    }

    const previousItemId = resolveDirectionalPreviousItemId({ itemElement, direction, rowsContainer: list.rowsContainer });
    if (previousItemId === undefined) {
      return;
    }

    const moveUrl = this.resolveMoveUrl({ itemId, type: resolveItemType(itemElement) });
    const sourceRow = rowOf(list.rowsContainer, itemElement);
    if (!moveUrl || !sourceRow) {
      return;
    }

    // Last, after every resolution above has succeeded. Several of those
    // steps bail — an unavailable direction, no owner list, no move URL —
    // and collapsing earlier would destroy the batch for a menu action that
    // then does nothing at all.
    this.selection?.collapseForMove(itemElement);

    void this.performMove({
      rows: [sourceRow],
      itemIds: null,
      rowsContainer: list.rowsContainer,
      listData: list.listData,
      previousItemId,
      moveUrl,
    });
  }

  // The list element an item currently belongs to, for the confinement field
  // on the drag payload; null outside any registered list.
  ownerListElementOf(itemElement:HTMLElement):HTMLElement|null {
    return this.ownerListOf(itemElement)?.element ?? null;
  }

  // The owning list of an item is the innermost list outlet containing its
  // element: in nested topologies (a section item hosting a field list) the
  // item is contained by every ancestor list, and only the innermost one
  // holds its row.
  private ownerListOf(itemElement:HTMLElement) {
    const containing = this.sortableListsListOutlets.filter((list) => list.element.contains(itemElement));

    return containing.find((list) => !containing.some((other) => other !== list && list.element.contains(other.element))) ?? null;
  }

  ownerRowsContainer(itemElement:HTMLElement):HTMLElement|null {
    return this.ownerListOf(itemElement)?.rowsContainer ?? null;
  }

  private async handleDrop({ location, source }:ElementDropPayload) {
    // Taken unconditionally, before any bail-out below: a cancelled drop (no
    // resolved intent) still consumes the frozen snapshot, so it can never
    // leak into the next drag.
    const frozenBatch = this.takeActiveDragBatch();

    if (this.busy) {
      debugLog('sortable-lists: ignoring drop, a move is already in progress');
      return;
    }

    if (!isSortableItemData(source.data) || !(source.element instanceof HTMLElement)) {
      debugLog('sortable-lists: ignoring drop, source is not a sortable item', source.data);
      return;
    }

    if (!this.element.contains(source.element)) {
      debugLog('sortable-lists: ignoring drop, source does not belong to this root');
      return;
    }

    const batchIds = this.batchIdsForDrop(frozenBatch, source.data.itemId);
    const moveUrl = batchIds
      ? this.resolveCollectionMoveUrl()
      : this.resolveMoveUrl({ itemId: source.data.itemId, type: source.data.type });
    if (!moveUrl) {
      debugLog('sortable-lists: ignoring drop, no move URL for item', source.data.itemId);
      return;
    }

    const intent = resolveDropIntent({
      location,
      root: this.element,
      sourceData: source.data,
      excludedItemIds: new Set(batchIds ?? [source.data.itemId]),
    });
    if (!intent) {
      debugLog('sortable-lists: ignoring drop, it did not resolve to a move');
      return;
    }

    const rows = batchIds
      ? this.rowsForItemIds(batchIds)
      : this.singleSourceRow(source.element);
    if (!rows) {
      debugLog('sortable-lists: ignoring drop, could not resolve every batch row');
      return;
    }

    await this.performMove({
      rows,
      itemIds: batchIds,
      rowsContainer: intent.rowsContainer,
      listData: intent.listData,
      previousItemId: intent.previousItemId,
      moveUrl,
    });
  }

  // The collection contract applies on a selection-enabled root with a
  // collection URL — for one dragged card or many. Other roots keep the
  // singular member contract.
  private batchIdsForDrop(frozenBatch:string[]|null, sourceItemId:string):string[]|null {
    if (!this.hasCollectionMoveUrlValue || this.collectionMoveUrlValue === '' || !this.selection) {
      return null;
    }

    return frozenBatch && frozenBatch.length > 0 ? frozenBatch : [sourceItemId];
  }

  private resolveCollectionMoveUrl(optimistic = this.optimisticValue):string|null {
    if (!this.hasCollectionMoveUrlValue || this.collectionMoveUrlValue === '') {
      return null;
    }

    const url = new URL(this.collectionMoveUrlValue, window.location.href);
    if (optimistic) {
      url.searchParams.set('optimistic', 'true');
    } else {
      url.searchParams.delete('optimistic');
    }

    return `${url.pathname}${url.search}${url.hash}`;
  }

  private async submitDestinationMove(moveUrl:string, body:FormData):Promise<void> {
    const request = new FetchRequest(
      'put',
      moveUrl,
      {
        body,
        responseKind: 'turbo-stream',
      },
    );

    this.startMoveRequest();
    try {
      const response = await request.perform();

      if (!response.isTurboStream) {
        throw new Error('Response is not a Turbo Stream');
      }

      // request.js renders successful and 422 streams automatically. Match
      // async-dialog's existing any-status stream behavior for every other
      // response until #AGILE-393 defines an application-wide policy.
      if (!response.ok && !response.unprocessableEntity) {
        await response.renderTurboStream();
      }
    } catch (error) {
      debugLog('Failed to move sortable list items to destination', error);
    } finally {
      this.finishMoveRequest();
    }
  }

  // Batch rows in frozen order. Refusing on any missing row is deliberate:
  // a member that vanished mid-drag means the server state moved on, and a
  // partial block would diverge from the ids the request claims to move.
  private rowsForItemIds(itemIds:string[]):HTMLElement[]|null {
    const rows:HTMLElement[] = [];

    for (const id of itemIds) {
      const itemElement = this.itemOutletElementFor(id);
      const container = itemElement ? this.ownerRowsContainer(itemElement) : null;
      const row = container && itemElement ? rowOf(container, itemElement) : null;
      if (!row) {
        return null;
      }
      rows.push(row);
    }

    return rows;
  }

  private singleSourceRow(sourceElement:HTMLElement):HTMLElement[]|null {
    const sourceList = this.ownerListOf(sourceElement);
    const sourceRow = sourceList ? rowOf(sourceList.rowsContainer, sourceElement) : null;
    return sourceRow ? [sourceRow] : null;
  }

  // Optimistically reorder a row or a frozen batch of rows, persist the
  // move, and roll the block back (with a FLIP animation and an error toast)
  // if the server rejects it. Shared by drag drops (single or batch) and
  // programmatic menu moves (always single, itemIds null).
  private async performMove({
    rows,
    itemIds,
    rowsContainer,
    listData,
    previousItemId,
    moveUrl,
  }:{
    rows:HTMLElement[];
    itemIds:string[]|null;
    rowsContainer:HTMLElement;
    listData:SortableListData;
    previousItemId:string|null;
    moveUrl:string;
  }):Promise<void> {
    // Captured before the reorder: afterwards the row already belongs to the
    // target list, so source-relative facts would be lost.
    const announcementContext:MoveAnnouncementContext = {
      label: resolveItemLabel(rows[0]),
      listName: listData.name,
      crossList: rows.some((row) => row.parentElement !== rowsContainer),
    };
    const rollback = captureRowPositions(rows);
    reorderRows({ rows, rowsContainer, previousItemId });

    // The reorder resolving back to the block's current DOM position means
    // the move is a no-op — nothing to persist, so no request. Comparing DOM
    // placement (not predecessor ids) keeps non-item rows such as truncation
    // markers out of the equation.
    if (rowsRemainAt(rollback)) {
      debugLog('sortable-lists: ignoring move, the item landed at its original position');
      return;
    }

    this.announceMove(announcementContext, rows, rowsContainer);

    const optimisticPlacement = captureRowPositions(rows);

    const result = await this.moveItem({ listData, previousItemId, moveUrl, itemIds });

    if (result.ok) {
      // The approved anchor lifecycle: successful movement clears selection
      // and anchor; failure preserves both for retry. Applies to the menu
      // path too — performMove is the shared success boundary.
      this.selection?.clearAfterMove();
      return;
    }

    let rolledBack = false;
    try {
      // A concurrent morph that removed or repositioned the rows carries
      // fresher server state than the pre-move snapshot; roll back only
      // while the rows still sit where the optimistic move put them.
      if (rowsRemainAt(optimisticPlacement)) {
        flipMove(rows, () => restoreRowPositions(rollback));
        // restoreRowPositions silently skips rows whose captured parent
        // disconnected, so verify the postcondition instead of trusting
        // the absence of an exception.
        rolledBack = rowsRemainAt(rollback);
      }
    } catch (error) {
      debugLog('Failed to roll back sortable list item move', error);
    }

    if (result.showToast) {
      this.dispatchErrorToast();
    }
    // A 422 streams its own flash and normally self-announces — but the flash
    // knows nothing about the client's rollback. When the rollback could not
    // be verified, the check-positions warning must be spoken regardless, or a
    // service rejection plus a concurrent morph fails silently.
    if (result.showToast || !rolledBack) {
      this.announceMoveFailure(announcementContext, rolledBack, rows.length);
    }
  }

  // The template must expand to a same-origin relative URL: the expansion is
  // reduced to path + search + hash, so an absolute template's origin would
  // be dropped silently.
  private resolveMoveUrl({ itemId, type }:{ itemId:string; type:string|null }):string|null {
    const template = this.moveUrlTemplateFor(type);
    if (!template) {
      return null;
    }

    const expanded = parseTemplate(template).expand({ id: itemId });
    const url = new URL(expanded, window.location.href);
    // Only consumers whose success response is event-only (Backlogs) opt in;
    // morph-reconciled surfaces need the server to stream the canonical order.
    if (this.optimisticValue) {
      url.searchParams.set('optimistic', 'true');
    }

    return `${url.pathname}${url.search}${url.hash}`;
  }

  // The dragged item's type keys the template: the move endpoint belongs to
  // the item being moved, not to the destination list.
  private moveUrlTemplateFor(type:string|null):string|null {
    if (type !== null && this.hasMoveUrlTemplatesValue && this.moveUrlTemplatesValue[type]) {
      return this.moveUrlTemplatesValue[type];
    }

    return this.hasMoveUrlTemplateValue ? this.moveUrlTemplateValue : null;
  }

  private async moveItem({
    listData,
    previousItemId,
    moveUrl,
    itemIds,
  }:{
    listData:SortableListData;
    previousItemId:string|null;
    moveUrl:string;
    itemIds:string[]|null;
  }):Promise<MoveResult> {
    const request = new FetchRequest(
      'put',
      moveUrl,
      {
        body: buildMoveFormData({
          listId: listData.listId,
          previousItemId,
          type: listData.type,
          itemIds,
        }),
        responseKind: 'turbo-stream',
      },
    );

    this.startMoveRequest();
    try {
      const response = await request.perform();

      if (!response.ok) {
        debugLog(`Failed to move sortable list item: ${response.statusCode}`);
      }

      return response.ok
        ? { ok: true }
        : { ok: false, showToast: response.statusCode !== 422 };
    } catch (error) {
      debugLog('Failed to move sortable list item due to request error', error);
      return { ok: false, showToast: true };
    } finally {
      this.finishMoveRequest();
    }
  }

  private startMoveRequest():void {
    this.inFlightMoveRequests += 1;
    this.syncBusyState();
  }

  private finishMoveRequest():void {
    this.inFlightMoveRequests = Math.max(0, this.inFlightMoveRequests - 1);
    this.syncBusyState();
  }

  private syncBusyState():void {
    // A successful frame stream may already have replaced this root. Avoid
    // mutating detached cached DOM; connect() will project the current count
    // if this element is restored later.
    if (this.element.isConnected) {
      this.setBusy(this.inFlightMoveRequests > 0);
    }
  }

  private setBusy(busy:boolean):void {
    if (busy) {
      this.element.setAttribute(sortableListsBusyAttribute, 'true');
    } else {
      this.element.removeAttribute(sortableListsBusyAttribute);
    }
  }

  private dispatchErrorToast():void {
    window.dispatchEvent(new CustomEvent(OPToastEvent, {
      detail: {
        message: I18n.t('js.error.internal'),
        type: 'error',
      },
    }));
  }

  // The one meaningful message for the whole optimistic move; spoken from the
  // global live region, in sync with what sighted users see. Failure paths
  // append their own message below. A 422 stays silent here: its error flash
  // is streamed by the server and self-announces (matching the toast rule).
  // The scope value lets a consumer (Backlogs) speak its own vocabulary
  // ("work package") instead of the generic "item".
  private announceMove(context:MoveAnnouncementContext, rows:HTMLElement[], rowsContainer:HTMLElement):void {
    const placement = resolveItemPosition({ row: rows[0], rowsContainer });
    if (!placement) {
      return;
    }

    const scope = this.moveAnnouncementScopeValue;
    // Resolved outside the options object literal below: nested inside it,
    // the call's generic return type would be inferred from the object's
    // contextual `TranslateOptions` index signature (`any`) instead of its
    // own `string` default.
    const label = context.label ?? I18n.t(`${scope}.fallback_item_label`);
    const listName = context.listName ?? I18n.t(`${scope}.fallback_list_name`);

    let message:string;
    if (rows.length > 1) {
      const first = placement.position;
      const last = placement.position + rows.length - 1;
      message = context.crossList
        ? I18n.t(`${scope}.moved_batch_to_list`, { count: rows.length, list: listName, first, last, total: placement.total })
        : I18n.t(`${scope}.moved_batch`, { count: rows.length, first, last, total: placement.total });
    } else {
      message = context.crossList
        ? I18n.t(`${scope}.moved_to_list`, { label, list: listName, position: placement.position, total: placement.total })
        : I18n.t(`${scope}.moved`, { label, position: placement.position, total: placement.total });
    }

    void announce(message, { politeness: 'polite' });
  }

  private announceMoveFailure(context:MoveAnnouncementContext, rolledBack:boolean, count:number):void {
    const scope = this.moveAnnouncementScopeValue;
    const label = context.label ?? I18n.t(`${scope}.fallback_item_label`);
    let message:string;
    if (rolledBack) {
      message = count > 1
        ? I18n.t(`${scope}.move_failed_rolled_back_batch`, { count })
        : I18n.t(`${scope}.move_failed_rolled_back`, { label });
    } else {
      message = count > 1
        ? I18n.t(`${scope}.move_failed_check_positions_batch`, { count })
        : I18n.t(`${scope}.move_failed_check_position`);
    }

    void announce(message, { politeness: 'assertive' });
  }

}
