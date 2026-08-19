<script lang="ts">
  /**
   * The MDViewer mark, reduced to what survives at 14px: a page whose first
   * line has already become a heading. Drawn in `currentColor` so it belongs
   * to whatever surface it sits on, in either theme.
   */
  interface Props {
    size?: number;
  }

  const { size = 16 }: Props = $props();
</script>

<svg
  class="mark"
  width={size}
  height={size}
  viewBox="0 0 400 400"
  fill="none"
  aria-hidden="true"
>
  <path
    d="M 112 108 Q 112 86 134 86 L 238 86 L 288 136 L 288 292 Q 288 314 266 314 L 134 314 Q 112 314 112 292 Z"
    stroke="currentColor"
    stroke-width="24"
    stroke-linejoin="round"
  />
  <path d="M 150 158 h 96" stroke="currentColor" stroke-width="34" stroke-linecap="round" />
  <path
    d="M 150 216 h 96 M 150 262 h 62"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    opacity="0.55"
  />
</svg>

<style>
  .mark {
    flex-shrink: 0;
    display: block;
  }
</style>
