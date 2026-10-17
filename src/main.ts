import { createApp } from "vue";
import "./style.css";
import "./content.css";
import App from "./App.vue";

import { installNavigation } from "./navigation";
installNavigation();
import { installAutoGrowingText } from "./auto-growing-text";
const app = createApp(App);
installAutoGrowingText(app);
app.mount("#app");
