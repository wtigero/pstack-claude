export type Band = {
  visible: boolean;
  workflow: string;
  model: string;
  effort: string;
};

declare module "claude-code" {
  interface PluginState {
    pstack: { band: Band };
  }
}
