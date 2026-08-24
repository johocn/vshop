<script lang="ts" setup>
import { onLaunch } from '@dcloudio/uni-app';
onLaunch(() => {});
</script>
<style lang="scss">
/* 全局基础样式占位 */
page { background: $wa-bg; color: $wa-ink; }

/* uni-app H5：修复 input 高度塌陷(1.4em)导致文字被裁剪为约1/10 */
uni-input {
  height: auto;
  min-height: 1.5em;
}
uni-input .uni-input-wrapper,
uni-input .uni-input-form {
  height: auto;
}
uni-input .uni-input-input {
  height: auto;
  min-height: 1.4em;
  line-height: 1.4em;
}
</style>