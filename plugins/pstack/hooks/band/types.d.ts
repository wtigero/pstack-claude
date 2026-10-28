export type Band = {
  visible: boolean;
  workflow: string;
};

declare module "claude-code" {
  interface PluginState {
    pstack: { band: Band };
  }
}
