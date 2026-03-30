<template>
  <v-container v-if="household" class="narrow-container">
    <BasePageTitle divider>
      <template #header>
        <v-img
          width="100%"
          max-height="100"
          max-width="100"
          src="/svgs/manage-group-settings.svg"
        />
      </template>
      <template #title>
        {{ $t("settings.list-providers") }}
      </template>
      {{ $t("settings.list-providers-description") }}
    </BasePageTitle>

    <section>
      <BaseCardSectionTitle :title="$t('settings.provider-configuration')" />
      <v-card class="mb-4 pa-4" variant="outlined" style="border-color: lightgray;">
        <v-select
          v-model="providerType"
          :items="providerOptions"
          item-title="label"
          item-value="value"
          :label="$t('settings.list-provider-type')"
          variant="outlined"
          density="compact"
          class="mb-4"
        />

        <!-- Nextcloud CalDAV Settings -->
        <v-expand-transition>
          <div v-if="providerType === 'nextcloud'">
            <v-text-field
              v-model="household.preferences.nextcloudUrl"
              label="Nextcloud URL"
              hint="e.g. https://nextcloud.example.com"
              persistent-hint
              variant="outlined"
              density="compact"
              class="mb-2"
            />
            <v-text-field
              v-model="household.preferences.nextcloudUsername"
              label="Username"
              variant="outlined"
              density="compact"
              class="mb-2"
            />
            <v-text-field
              v-model="household.preferences.nextcloudPassword"
              :type="showNcPassword ? 'text' : 'password'"
              label="Password"
              variant="outlined"
              density="compact"
              class="mb-2"
            >
              <template #append-inner>
                <v-icon
                  style="cursor: pointer"
                  @click="showNcPassword = !showNcPassword"
                >
                  {{ showNcPassword ? $globals.icons.eyeOff : $globals.icons.eye }}
                </v-icon>
              </template>
            </v-text-field>
            <v-combobox
              v-model="household.preferences.nextcloudTaskList"
              :items="ncCalendars"
              item-title="name"
              item-value="slug"
              :return-object="false"
              label="Task List"
              hint="Select or type a task list name"
              persistent-hint
              variant="outlined"
              density="compact"
              class="mb-2"
            />
            <v-switch
              v-model="household.preferences.nextcloudVerifySsl"
              label="Verify SSL"
              color="primary"
              density="compact"
            />
          </div>
        </v-expand-transition>

        <!-- Todoist Settings -->
        <v-expand-transition>
          <div v-if="providerType === 'todoist'">
            <v-text-field
              v-model="household.preferences.todoistApiToken"
              :type="showTodoistToken ? 'text' : 'password'"
              label="Todoist API Token"
              hint="Get from Todoist Settings > Integrations > Developer"
              persistent-hint
              variant="outlined"
              density="compact"
              class="mb-2"
            >
              <template #append-inner>
                <v-icon
                  style="cursor: pointer"
                  @click="showTodoistToken = !showTodoistToken"
                >
                  {{ showTodoistToken ? $globals.icons.eyeOff : $globals.icons.eye }}
                </v-icon>
              </template>
            </v-text-field>
            <v-combobox
              v-model="household.preferences.todoistProject"
              :items="todoistProjects"
              item-title="name"
              item-value="id"
              :return-object="false"
              label="Project"
              hint="Select or type a project name"
              persistent-hint
              variant="outlined"
              density="compact"
              class="mb-2"
            />
          </div>
        </v-expand-transition>

        <!-- Test & Error -->
        <v-alert v-if="testError" type="error" density="compact" class="mb-4">
          {{ testError }}
        </v-alert>
        <v-alert v-if="testSuccess" type="success" density="compact" class="mb-4">
          Connection successful
        </v-alert>

        <div class="d-flex justify-end" style="gap: 8px">
          <BaseButton
            v-if="providerType"
            :loading="testLoading"
            @click="handleTest"
          >
            <template #icon>
              <v-icon start>
                {{ $globals.icons.check }}
              </v-icon>
            </template>
            Test Connection
          </BaseButton>
          <BaseButton
            edit
            :loading="saveLoading"
            @click="handleSave"
          >
            {{ $t("general.save") }}
          </BaseButton>
        </div>
      </v-card>
    </section>
  </v-container>
</template>

<script setup lang="ts">
import { useHouseholdSelf } from "~/composables/use-households";
import { useUserApi } from "~/composables/api";
import { alert } from "~/composables/use-toast";

definePageMeta({
  middleware: ["can-manage-household-only"],
});

const { household, actions: householdActions } = useHouseholdSelf();
const api = useUserApi();
const i18n = useI18n();

useSeoMeta({
  title: i18n.t("settings.list-providers"),
});

const showNcPassword = ref(false);
const showTodoistToken = ref(false);
const testLoading = ref(false);
const saveLoading = ref(false);
const testError = ref("");
const testSuccess = ref(false);
const ncCalendars = ref<Array<{ name: string; slug: string }>>([]);
const todoistProjects = ref<Array<{ id: string; name: string }>>([]);

const providerOptions = [
  { label: "None", value: null },
  { label: "Nextcloud CalDAV", value: "nextcloud" },
  { label: "Todoist", value: "todoist" },
];

const providerType = computed({
  get: () => household.value?.preferences?.listProviderType ?? null,
  set: (val) => {
    if (household.value?.preferences) {
      household.value.preferences.listProviderType = val;
    }
  },
});

async function handleSave() {
  saveLoading.value = true;
  const data = await householdActions.updatePreferences();
  saveLoading.value = false;
  if (data) {
    alert.success(i18n.t("settings.settings-updated"));
  }
  else {
    alert.error(i18n.t("settings.settings-update-failed"));
  }
}

async function handleTest() {
  testLoading.value = true;
  testError.value = "";
  testSuccess.value = false;

  // Save first so the backend reads fresh credentials
  await householdActions.updatePreferences();

  try {
    if (providerType.value === "nextcloud") {
      const { data } = await api.households.testNextcloud();
      if (data?.success) {
        testSuccess.value = true;
        ncCalendars.value = data.calendars;
      }
      else {
        testError.value = data?.error || "Connection failed";
      }
    }
    else if (providerType.value === "todoist") {
      const { data } = await api.households.testTodoist();
      if (data?.success) {
        testSuccess.value = true;
        todoistProjects.value = data.projects;
      }
      else {
        testError.value = data?.error || "Connection failed";
      }
    }
  }
  catch (e) {
    testError.value = String(e);
  }

  testLoading.value = false;
}
</script>
