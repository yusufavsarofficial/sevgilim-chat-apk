type RuntimeGlobal = {
  FormData?: unknown;
  Blob?: unknown;
  File?: unknown;
  window?: unknown;
  document?: unknown;
  localStorage?: unknown;
};

const runtimeGlobal = globalThis as unknown as RuntimeGlobal;

export function installFormDataPolyfill(): void {
  try {
    if (runtimeGlobal.FormData) {
      return;
    }

    const reactNativeFormData = require("react-native/Libraries/Network/FormData").default;
    if (reactNativeFormData) {
      runtimeGlobal.FormData = reactNativeFormData;
    }
  } catch (error) {
    console.warn("FormData polyfill kurulamadı.", error);
  }
}

export function installSafeWebGlobals(): void {
  try {
    runtimeGlobal.window ??= runtimeGlobal;
    runtimeGlobal.document ??= undefined;
    runtimeGlobal.localStorage ??= undefined;
  } catch (error) {
    console.warn("Web global fallback kurulamadı.", error);
  }
}

installFormDataPolyfill();
installSafeWebGlobals();
