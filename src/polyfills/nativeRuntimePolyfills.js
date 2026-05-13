/* eslint-disable no-console */
const g =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof global !== "undefined"
      ? global
      : {};

try {
  if (!g.performance) {
    g.performance = {};
  }

  if (typeof g.performance.now !== "function") {
    const start = Date.now();
    g.performance.now = function now() {
      return Date.now() - start;
    };
  }
} catch (error) {
  console.warn("performance.now polyfill yuklenemedi:", error);
}

try {
  if (typeof g.FormData === "undefined") {
    const RNFormData = require("react-native/Libraries/Network/FormData");
    g.FormData = RNFormData.default || RNFormData;
  }
} catch (error) {
  console.warn("FormData polyfill yuklenemedi:", error);
}

try {
  if (typeof g.window === "undefined") {
    g.window = g;
  }
} catch (error) {
  console.warn("window fallback yuklenemedi:", error);
}
