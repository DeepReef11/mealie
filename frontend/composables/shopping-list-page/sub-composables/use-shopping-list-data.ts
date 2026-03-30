import { useOnline, useIdle } from "@vueuse/core";
import { SSE } from "sse.js";
import type { ShoppingListOut } from "~/lib/api/types/household";
import { useShoppingListItemActions } from "~/composables/use-shopping-list-item-actions";

/**
 * Composable for managing shopping list data fetching via SSE with polling fallback
 */
export function useShoppingListData(listId: string, shoppingList: Ref<ShoppingListOut | null>, loadingCounter: Ref<number>) {
  const isOffline = computed(() => useOnline().value === false);
  const { idle } = useIdle(5 * 60 * 1000); // 5 minutes
  const shoppingListItemActions = useShoppingListItemActions(listId);

  async function fetchShoppingList() {
    const data = await shoppingListItemActions.getList();
    return data;
  }

  async function refresh(updateListItemOrder: () => void) {
    loadingCounter.value += 1;
    try {
      await shoppingListItemActions.process();
    }
    catch (error) {
      console.error(error);
    }

    let newListValue: typeof shoppingList.value = null;
    try {
      newListValue = await fetchShoppingList();
    }
    catch (error) {
      console.error(error);
    }

    loadingCounter.value -= 1;

    // only update the list with the new value if we're not loading, to prevent UI jitter
    if (loadingCounter.value) {
      return;
    }

    // Prevent overwriting local changes with stale backend data when offline
    if (isOffline.value) {
      // Do not update shoppingList.value from backend when offline
      updateListItemOrder();
      return;
    }

    // if we're not connected to the network, this will be null, so we don't want to clear the list
    if (newListValue) {
      shoppingList.value = newListValue;
    }

    updateListItemOrder();
  }

  // =======================================================================
  // SSE-based live updates with polling fallback

  let sseConnection: InstanceType<typeof SSE> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let sseActive = false;

  // Polling fallback (used when SSE is unavailable)
  const pollFrequency = 5000;
  const maxAttempts = 17280;
  let attempts = 0;

  async function pollForChanges(updateListItemOrder: () => void) {
    if (idle.value || loadingCounter.value) {
      return;
    }

    try {
      await refresh(updateListItemOrder);
      if (shoppingList.value) {
        attempts = 0;
        return;
      }
      attempts++;
    }
    catch {
      attempts++;
    }

    if (attempts >= maxAttempts && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPollingFallback(updateListItemOrder: () => void) {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      pollForChanges(updateListItemOrder);
    }, pollFrequency);
  }

  function stopPollingFallback() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function connectSSE(updateListItemOrder: () => void) {
    if (typeof window === "undefined") return; // SSR guard

    const sseUrl = `/api/households/shopping/lists/${listId}/stream`;

    try {
      sseConnection = new SSE(sseUrl, {
        withCredentials: true,
      });

      sseConnection.addEventListener("items_changed", () => {
        // An item changed — refresh the list from the API
        refresh(updateListItemOrder);
      });

      sseConnection.addEventListener("open", () => {
        sseActive = true;
        // SSE connected — stop polling fallback
        stopPollingFallback();
      });

      sseConnection.addEventListener("error", () => {
        sseActive = false;
        // SSE failed — fall back to polling
        startPollingFallback(updateListItemOrder);
      });

      sseConnection.stream();
    }
    catch {
      // SSE setup failed — fall back to polling
      sseActive = false;
      startPollingFallback(updateListItemOrder);
    }
  }

  // start polling
  loadingCounter.value -= 1;

  function startPolling(updateListItemOrder: () => void) {
    // Initial data load
    pollForChanges(updateListItemOrder);

    // Try SSE first, with polling as fallback
    connectSSE(updateListItemOrder);

    // Also start polling initially — SSE will stop it once connected
    startPollingFallback(updateListItemOrder);
  }

  function stopPolling() {
    stopPollingFallback();
    if (sseConnection) {
      try {
        sseConnection.close();
      }
      catch {
        // ignore close errors
      }
      sseConnection = null;
      sseActive = false;
    }
  }

  return {
    isOffline,
    fetchShoppingList,
    refresh,
    startPolling,
    stopPolling,
    shoppingListItemActions,
  };
}
