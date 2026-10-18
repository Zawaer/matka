// Defines the background-location task at module scope. This must run before
// anything else so a headless launch (app killed, OS delivers locations) finds it.
import "./src/tracking";

import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
