/**
 * Sidebar state: the folder tree and the document outline.
 */
import { listDir, resolveTreeRoot } from '../ipc/commands';
import { afterPaint } from '../ui/afterPaint';
import type { TreeEntry } from '../ipc/types';
import type { OutlineItem } from '../editor/outline';

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const MIN_OUTLINE_WIDTH = 160;
const MAX_OUTLINE_WIDTH = 380;

class WorkspaceStore {
  /** Files live on the left, the outline on the right: they are different
   *  questions — "which document?" and "where am I in it?" — and sharing one
   *  panel forced the reader to give up one to see the other. */
  sidebarVisible = $state(true);
  width = $state(260);

  outlineVisible = $state(true);
  outlineWidth = $state(240);

  /**
   * Where the divider between the two panes sits, as a share of the room.
   *
   * A fraction rather than a width: the window is resized far more often than
   * the divider is dragged, and a pixel value would quietly stop being half
   * the window the first time it happened.
   */
  splitRatio = $state(0.5);

  setSplitRatio(value: number): void {
    this.splitRatio = Math.min(0.8, Math.max(0.2, value));
  }

  /** Narrow windows float the panels over the document instead of pushing it. */
  overlayMode = $state(false);

  treeRoot = $state<string | null>(null);
  children = $state<Record<string, TreeEntry[]>>({});
  expanded = $state<Record<string, boolean>>({});
  treeLoading = $state(false);

  /**
   * Bumped on every edit, for the preview pane to notice.
   *
   * The document itself lives in CodeMirror, outside reactive state on
   * purpose; this is the one bit of it the page beside it has to hear about.
   */
  previewRevision = $state(0);

  outline = $state<OutlineItem[]>([]);
  activeOutline = $state(-1);
  /** First document offset on screen — tells the crumbs what is already visible. */
  viewportFrom = $state(0);

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
  }

  toggleOutline(): void {
    this.outlineVisible = !this.outlineVisible;
  }

  setWidth(value: number): void {
    this.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));
  }

  setOutlineWidth(value: number): void {
    this.outlineWidth = Math.max(MIN_OUTLINE_WIDTH, Math.min(MAX_OUTLINE_WIDTH, Math.round(value)));
  }

  /**
   * True from the moment a document is opened until its folder is on screen.
   *
   * It guards against two files starting two loads, and it is also what the
   * sidebar reads: with the tree arriving a beat later, the panel must not
   * spend that beat saying there is no folder open. Empty and quiet, then the
   * tree — never a sentence that turns out to be untrue.
   */
  rootPending = $state(false);

  /**
   * The folder is not what the reader is waiting for.
   *
   * Opening a document used to wait for the folder beside it: resolve the
   * root, list it, build every row — all before the file that was
   * double-clicked reached the screen. They answer two different questions,
   * "show me this" and "what else is here", and only the first one was asked
   * by the double-click. So the document is painted, and the tree arrives
   * behind it.
   */
  scheduleRootFromFile(filePath: string): void {
    if (this.treeRoot || this.rootPending) return;
    this.rootPending = true;
    afterPaint(() => {
      void this.setRootFromFile(filePath).finally(() => {
        this.rootPending = false;
      });
    });
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
