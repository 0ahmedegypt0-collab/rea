import { requireNativeModule } from "expo";

export type ReaRuntimeInspection = {
  available: boolean;
  nodePath: string;
  prefixPath: string;
  appPrivateDirectory: string;
  architecture: string | null;
};

export type ReaRuntimeVersion = {
  version: string;
  exitCode: number;
  nodePath: string;
};

type ReaRuntimeNativeModule = {
  inspect(): Promise<ReaRuntimeInspection>;
  runVersion(): Promise<ReaRuntimeVersion>;
};

export default requireNativeModule<ReaRuntimeNativeModule>("ReaRuntime");
