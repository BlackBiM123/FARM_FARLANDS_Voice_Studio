<script setup lang="ts">
import { onMounted, ref } from "vue";
import { cloudRequest } from "../cloud-client";
const props = defineProps<{ currentId: string }>();
type Account = {
  id: string;
  username: string;
  name: string;
  role: "admin" | "user";
  enabled: boolean;
};
const users = ref<Account[]>([]),
  username = ref(""),
  name = ref(""),
  password = ref(""),
  role = ref<"admin" | "user">("user"),
  message = ref(""),
  working = ref(false),
  resetId = ref(""),
  resetPassword = ref("");
async function load() {
  try {
    users.value = (await cloudRequest("/api/users")).users;
  } catch (e) {
    message.value = e instanceof Error ? e.message : "Ошибка";
  }
}
onMounted(load);
function randomPassword() {
  return (
    "Ff-" +
    btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))),
    ).replace(/[+/=]/g, "x") +
    "!"
  );
}
async function create() {
  working.value = true;
  message.value = "";
  try {
    await cloudRequest("/api/users", "POST", {
      username: username.value,
      name: name.value,
      password: password.value,
      role: role.value,
    });
    message.value =
      "Пользователь создан. Передайте ему логин и заданный пароль.";
    username.value = "";
    name.value = "";
    password.value = "";
    role.value = "user";
    await load();
  } catch (e) {
    message.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    working.value = false;
  }
}
async function update(id: string, changes: Record<string, unknown>) {
  working.value = true;
  try {
    await cloudRequest("/api/users", "PATCH", { id, ...changes });
    message.value = "Настройки пользователя сохранены";
    resetId.value = "";
    resetPassword.value = "";
    await load();
  } catch (e) {
    message.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    working.value = false;
  }
}
</script>
<template>
  <section class="users-panel panel">
    <h2>Пользователи студии</h2>
    <p class="hint">
      Только администратор создаёт учётные записи. Пользователи работают с общим
      проектом Farm & Farlands. Публичной регистрации в студии нет.
    </p>
    <form class="user-create" @submit.prevent="create">
      <div class="fields">
        <label
          >Логин нового пользователя<input
            v-model="username"
            required
            minlength="3"
            maxlength="32"
            pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}"
            autocomplete="off"
            placeholder="Например, voice_artist" /></label
        ><label>Имя<input v-model="name" maxlength="80" /></label
        ><label
          >Пароль нового пользователя<input
            v-model="password"
            required
            minlength="12"
            maxlength="128"
            autocomplete="new-password"
          /><button type="button" @click="password = randomPassword()">
            Сгенерировать пароль
          </button></label
        ><label
          >Роль<select v-model="role">
            <option value="user">Пользователь — работа со студией</option>
            <option value="admin">
              Администратор — управление пользователями
            </option>
          </select></label
        >
      </div>
      <button class="primary" :disabled="working">Добавить пользователя</button>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
    <article v-for="u in users" :key="u.id" class="account-row">
      <div>
        <strong>{{ u.username }}</strong
        ><small
          >{{ u.name }} ·
          {{ u.role === "admin" ? "Администратор" : "Пользователь" }} ·
          {{ u.enabled ? "Активен" : "Отключён" }}</small
        >
      </div>
      <div class="account-actions">
        <button
          :disabled="working || u.id === props.currentId"
          @click="update(u.id, { enabled: !u.enabled })"
        >
          {{ u.enabled ? "Отключить" : "Включить" }}</button
        ><button
          :disabled="working || u.id === props.currentId"
          @click="update(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })"
        >
          {{
            u.role === "admin" ? "Сделать пользователем" : "Сделать админом"
          }}</button
        ><button
          @click="
            resetId = u.id;
            resetPassword = '';
          "
        >
          Новый пароль
        </button>
      </div>
      <form
        v-if="resetId === u.id"
        class="password-reset"
        @submit.prevent="update(u.id, { password: resetPassword })"
      >
        <label
          >Новый пароль<input
            v-model="resetPassword"
            type="password"
            required
            minlength="12"
            maxlength="128"
            autocomplete="new-password" /></label
        ><button class="primary" :disabled="working">Сохранить пароль</button
        ><button type="button" @click="resetId = ''">Отмена</button>
      </form>
    </article>
  </section>
</template>
