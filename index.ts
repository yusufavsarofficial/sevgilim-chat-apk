import "./src/polyfills/nativeRuntimePolyfills";
import "./src/polyfills";
import { AppRegistry } from "react-native";
import React from "react";
import App from "./App";
import { AppErrorBoundary } from "./src/AppErrorBoundary";

function Root(): React.JSX.Element {
  return React.createElement(AppErrorBoundary, null, React.createElement(App));
}

AppRegistry.registerComponent("main", () => Root);
