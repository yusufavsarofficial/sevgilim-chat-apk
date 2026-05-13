declare module "react-native/Libraries/Network/FormData" {
  export type FormDataValue = string | { name?: string; type?: string; uri: string };

  export default class RNFormData {
    append(key: string, value: FormDataValue): void;
    getAll(key: string): FormDataValue[];
    getParts(): unknown[];
  }
}
