import { requireNativeModule } from "expo";

export type ReaRuntimeInspection = {
  available: boolean;
  bundledAssetPresent: boolean;
  engineAvailable: boolean;
  engineAssetPresent: boolean;
  enginePath: string;
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
  installBundledRuntime(): Promise<{ installed: boolean; sha256: string; directory: string }>;
  installBundledEngine(): Promise<{ installed: boolean; sha256: string; directory: string }>;
  readCatalog(): Promise<string>;
};

export default requireNativeModule<ReaRuntimeNativeModule>("ReaRuntime");
