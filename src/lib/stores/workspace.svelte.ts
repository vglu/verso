/**
 * Sidebar state: the folder tree and the document outline.
 */
import { listDir, resolveTreeRoot } from '../ipc/commands';
import type { TreeEntry } from '../ipc/types';
import type { OutlineItem } from '../editor/outline';

export type SidebarPanel = 'files' | 'outline';

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

class WorkspaceStore {
  sidebarVisible = $state(true);
  panel = $state<SidebarPanel>('files');
  width = $state(260);
  /** Narrow windows float the sidebar over the document instead of pushing it. */
  overlayMode = $state(false);

  treeRoot = $state<string | null>(null);
  children = $state<Record<string, TreeEntry[]>>({});
  expanded = $state<Record<string, boolean>>({});
  treeLoading = $state(false);

  outline = $state<OutlineItem[]>([]);
  activeOutline = $state(-1);

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
  }

  showPanel(panel: SidebarPanel): void {
    this.panel = panel;
    this.sidebarVisible = true;
  }

  setWidth(value: number): void {
    this.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));
  }

  async setRootFromFile(filePath: string): Promise<void> {
    try {
      const root = await resolveTreeRoot(filePath);
      await this.setRoot(root);
    } catch (e) {
      console.warn('cannot resolve tree root', e);
    }
  }

  async setRoot(root: string): Promise<void> {
    if (this.treeRoot === root && this.children[root]) return;
    this.treeRoot = root;
    this.children = {};
    this.expanded = {};
    await this.loadChildren(root);
  }

  async loadChildren(dir: string): Promise<void> {
    if (this.children[dir]) return;
    this.treeLoading = true;
    try {
      this.children = { ...this.children, [dir]: await listDir(dir) };
    } catch (e) {
      console.warn('cannot list', dir, e);
      this.children = { ...this.children, [dir]: [] };
    } finally {
      this.treeLoading = false;
    }
  }

  async toggleDir(dir: string): Promise<void> {
    const next = !this.expanded[dir];
    this.expanded = { ...this.expanded, [dir]: next };
    if (next) await this.loadChildren(dir);
  }

  /** Drop cached listings so the next render reflects the filesystem. */
  async refreshTree(): Promise<void> {
    const root = this.treeRoot;
    if (!root) return;
    const openDirs = Object.keys(this.expanded).filter((d) => this.expanded[d]);
    this.children = {};
    await this.loadChildren(root);
    for (const dir of openDirs) await this.loadChildren(dir);
  }

  setOutline(items: OutlineItem[], activeIndex: number): void {
    this.outline = items;
    this.activeOutline = activeIndex;
  }
}

export const workspace = new WorkspaceStore();
