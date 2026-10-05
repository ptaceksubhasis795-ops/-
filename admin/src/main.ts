import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./style.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: App },
    { path: "/content/articles", component: App },
    { path: "/content/articles/new", component: App },
    { path: "/content/articles/:id/edit", component: App },
    { path: "/products/:subpage?", component: App },
    { path: "/sales/:subpage?", component: App },
    { path: "/customers/profile/:id/:tab?", component: App },
    { path: "/customers/:subpage?/:id?", component: App },
    { path: "/data/:subpage?", component: App },
    { path: "/settings/:subpage?", component: App },
  ],
});
createApp(App).use(createPinia()).use(router).mount("#app");
