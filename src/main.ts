import { createApp } from "vue";
import "./style.css";
import "./content.css";
import App from "./App.vue";

import { installNavigation } from "./navigation";
installNavigation();
createApp(App).mount("#app");
