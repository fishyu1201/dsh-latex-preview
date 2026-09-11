# 与 DeepSeek Harness 插件规范的符合性

[English](CONFORMANCE.md) | 中文

本文是 `dsh-latex-preview` 对照 Harness 官方文档、随安装附带的包清单 schema、以及仓库内样式规范的一次审计。
下面每一条都对照来源核过，不是凭记忆写的；来源都列了出来，便于复核。

结论：**在清单、模块加载、控件复用、本地化和样式规范上均符合**，另有 3 处有意保留的偏离，
每一处都给出了理由（见[偏离项](#偏离项)）。

## 依据来源

| 内容 | 位置 |
|---|---|
| 插件结构、三种形态、`inject`、`ctx.effect` | [docs/user/develop/basic/index.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/user/develop/basic/index.md) |
| bundle 与 profile、安装、层序、git 安装规则 | [docs/user/develop/basic/publish.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/user/develop/basic/publish.md) |
| `dsh.client` 扫描、启动图、combo 路由、bundle 契约 | [docs/subsystems/client-modules.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/subsystems/client-modules.md) |
| 样式归属、token、组件规则 | [docs/web-styling.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/web-styling.md) |
| 清单字段 | `@deepseek-ai/dsh-package-manifest` → `DshManifest`、`DshClientManifest` |
| 样式规范内部实现（elevation、corner-shape） | `@deepseek-ai/dsh-client-ui-theme` |
| 双语文档配对 | [docs/i18n/README.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/master/docs/i18n/README.md) |

## 清单（manifest）

`DshManifest` 只接受 `bundle`、`profile`、`client`、`configTrees`、`sessionFormatMigration`
以及由启动器写入的 `moduleFallback`。本包只声明其中两项，没有别的：

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "platform": "web",
    "inject": ["@deepseek-ai/dsh-client-ui-conversation", "…"],
    "external": ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives"]
  }
}
```

| 字段 | 规则 | 状态 |
|---|---|---|
| `dsh.bundle.patch` | 相对包根的 patch 路径 | ✅ `./cordis.patch.yml` |
| `dsh.client.platform` | 该消费方使用 `web` | ✅ |
| `dsh.client.inject` | **信息性**的包名依赖——文档明确说这**不是** Cordis 服务注入 | ✅ 列出它所填充插槽的宿主行 |
| `dsh.client.external` | 超出隐式基线的、精确的模块表请求，且不得引用自身 | ✅ 三个 specifier；与构建产物实际 `require` 的完全一致（有测试断言） |
| `exports["./client"]` | 声明 `dsh.client` 时必需 | ✅ `./client.js` |
| 无未知字段 | 声明畸形会让扫描大声失败 | ✅ 没有自造字段 |

`cordis.patch.yml` 以**包名**插入一行，这正是它能作为 bundle 安装的原因——
`docs/user/develop/basic/publish.md` 明确要求随包发布的 patch 中，行应"用包名引用而不是相对源码路径，
以便 Node 解析找到已安装的代码"。

不过本插件实际是**通过 profile 自己的 patch 层、以绝对路径**安装的，也就是
`docs/user/develop/basic/index.md` 给本地插件的形式。这个选择由两条实测结论决定，两条都在运行中的
服务器上验证过：

- `patchReload: live` 监视的是 **patch 文件**。而 `dsh plugin add` 写的是 `package.json` 里的
  bundle 列表，那份列表只在启动时读取——正在运行的 `dsh web` 永远看不到它。
- 两种形式**不能并存**。bundle 行加上 profile 里的 insert 会产生两个同 id 的 loader 条目，
  cordis 会以 `duplicate loader entry id: dsh-latex-preview` 中止启动。

选择本地形式并不损失符合性——两者都是文档化的——却换来一个能作用于运行中服务器的插件。

## 插件形态与生命周期

文档允许函数、对象、类三种形态。host 半边采用对象形态加具名函数，也就是文档中"不提供服务"的插件所用的写法：

```js
export const name = 'dsh-latex-preview'
export const inject = []
export function apply(ctx) { … }
export default { name, inject, apply }
```

- ✅ **无需手工清理。** 唯一比渲染活得更久的资源——注入的 `<style>` 元素——通过 `ctx.effect` 释放，
  这是文档指定的机制。
- ✅ **依赖已声明。** 客户端半边声明 `inject = ['slots', 'locale']`，框架会等两个服务就绪后才跑 `apply`。
- ✅ **带命名空间的日志。** host 半边通过 `ctx.logger` 输出。

## 客户端模块契约

`docs/subsystems/client-modules.md`：「Entry name == package name」，bundle 是 `exports["./client"]`，
浏览器通过模块加载信封加载它。

- ✅ 信封 id 为 `dsh-latex-preview`，即包名。
- ✅ 只导出一个面：`apply` + `inject`（另有 `default`，与所有随包发布的客户端包一致）。
- ✅ bundle 请求的一切，要么是静态模块表里的模块，要么是自己的代码。没有第二份 React，
  没有共享控件的副本，运行时也没有任何网络请求。
- ✅ 本插件只向自己声明依赖的插槽投稿——`conversation.input.dock`、`settings.section`，
  以及键控插槽 `conversation.chat.node` 的 `user` 与 `steering` 两个键——并且只通过标准的
  `useInput` 选择器钩子读取文档化的 `InputState.draft`。
- ✅ 唯一一个 document 级监听器（复制为 LaTeX）装在 `ctx.effect` 里，随插件一起释放，
  不会泄漏。
- ✅ 占用 `user` 键是键控插槽的文档化行为（"reusing a key replaces that node renderer"）；
  代价见[偏离项](#偏离项)中的说明。

## 样式规范

`docs/web-styling.md` 把规则写成了可检查的约束。每一条要么满足，要么列在[偏离项](#偏离项)里。

| 规则 | 状态 |
|---|---|
| 使用 `--dsw-alias-*` 语义 token；不得写死颜色 | ✅ 已无任何字面颜色；审计中删掉了唯一一处 `#fff` |
| 特性组件 CSS 中不得有主题选择器或明暗分支 | ✅ 无 |
| 抬升表面用 `border: 0` 配 elevation 阴影；绝不把边框和 lv 阴影配在一起 | ✅ 面板为 `border: 0` + `var(--dsw-elevation-soft)`，即输入框自身的高度 |
| 中性 `--dsw-alias-border-*` 分隔线画 `0.5px` | ✅ 头部接缝与折叠条均为 `0.5px` |
| 凡是全圆角都要配 `corner-shape: round` | ✅ 状态圆点已配对；胶囊形控件已移交 `ui-primitives`，由其掌管圆角 |
| 先复用控件再谈改造——`ui-primitives` 目录是唯一能跨越特性包的通道 | ✅ `Tag`、`Button`、`Tooltip`、`Switch` 及箭头图标均从中导入；手写的开关、分段控件、按钮、徽标、内联 SVG 已全部删除 |
| 不要写组件私有的滚动条选择器，用共享样式 | ✅ 主题已在全局设置滚动条样式，本地覆盖已删除 |
| 字号必须配行高 | ✅ 样式表里每个 `font-size` 都带 `line-height` |
| 表现放 CSS；内联样式可传组件内自定义属性值，但不得编码主题分支 | ✅ 唯一一处内联样式传的是 `--lp-max-height`，一个布局值 |
| 保留键盘焦点可见性与减弱动效 | ✅ 折叠条有 `:focus-visible` 描边；入场动画与公式底色过渡都在 `prefers-reduced-motion` 下让位 |

关于发丝线规则有一处刻意的解读：聚焦台左侧竖线是 `--dsw-alias-state-business-primary` 的
**2px 强调标记**，不是中性分隔线。该规则管的是"使用中性 `--dsw-alias-border-*` token 的
扁平边框与分隔线"，而这条竖线既不扁平也不中性——它是面板的身份标记。

## 本地化

依据 `docs/i18n` 以及所有随包发布的客户端包都在用的 locale 席位。

- ✅ 词典通过 `ctx.locale.register(NS, { zh, en })` 一次注册两种语言，并有测试断言两套键集合完全相同
  ——注册表会拒绝不平衡的一对。
- ✅ 两个插槽条目都声明 `locale: NS`，框架因此注入绑定的 `t`，切换语言时面板通过共享席位重绘。
- ✅ 插槽 `label` 通过 `t` 解析，而不是字面量。
- ✅ 没有任何模块去读 `document.documentElement.lang`；手写的 i18n 模块已删除。
- ✅ 两份 README 构成双语对，且按 `docs/i18n/README.md` 的要求互相链接。

## 偏离项

共 3 处，每一处都是权衡后的取舍，不是疏漏。

### 1. 偏好存在 `localStorage`，而不是持久化设置命名空间

文档给出的特性偏好路径是：host 侧注册一个设置命名空间，客户端通过
`ctx.settingsScope.bind({ namespace })` 读取。而那次注册需要一份 `@deepseek-ai/schemastery`
schema（`SettingsProvider.register(ns, schema)`）；对一个源码位于 profile 之外的树外包来说，
`@deepseek-ai/schemastery` 是解析不到的——profile 的 `node_modules` 里没有它，而加载器是按包自身
所在位置解析其 import 的。

唯一拿到它的办法，是把 `@deepseek-ai/schemastery` 声明为本包自己的依赖。那会带来**第二份
schemastery 实例**的风险，`settings.register` 不会把它认作自己的 schema——于是整个插件在加载时
失败，而不只是那三个开关失效。

这只是预览面板的表现层偏好。为了持久保存 `{enabled, bench, maxHeight}` 而拿一个能用的面板去换，
是把账算反了，所以本插件保留本地、浏览器范围的存储，并在 `prefs.js` 里写明了原因。

### 2. 没有使用 CSS Modules

`docs/web-styling.md` 要求特性组件使用 CSS Modules。那是由仓库的 Vite 管线编译的；而本包是一个由
esbuild 构建、经模块加载信封被 shell 加载的单一浏览器 bundle，自身没有 CSS 管线。

该规则想要达到的隔离，在这里用另一种方式达成：所有选择器都带前缀，整张表 scope 在稳定的
`.lp-root` 类之下，并有测试断言。而且无论怎样都需要一个稳定的根类——内置的 KaTeX 样式表
（363 KB、20 个内嵌 woff2 字体）就 scope 在同一个类下，它不可能活在一个哈希名里。

### 3. 没有使用 `clsx`

`clsx` 不在 shell 的静态模块表里，客户端 bundle 只能靠打包一份副本来获得它。这里的类名列表只有
三四项，用 `.filter(Boolean).join(' ')` 拼出来即可；为了满足一条规则而引入一个依赖去重新实现它，
比这条规则本身更糟。

### 4. 接管用户消息行

这不是规范偏离——`conversation.chat.node` 是键控插槽，文档明确写着复用某个键会替换该渲染器
——但它是本插件做得最重的一件事，所以记在这里。

没有办法在保留原生气泡的同时只排版其中的文字：这个插槽是全有或全无的。渲染器没有去 fork
shell 的消息 UI，而是从 fork 者只能靠猜的那些来源重建它——shell 自己的样式值
（`userRow`、`userStack`、`bubble`、附件卡片、操作行）与它导出的原件（命令与文件芯片用
`projectUserText`，另有 `FileTypeIcon`、`fileExtension`、`fileSizeText`、`JsonBlock`、
`writeClipboard`）。因此不含公式的消息渲染出的是与改动前相同的树，而源码始终是唯一事实来源：
消息级复制拿到的仍是原文，模型收到的内容从头到尾没有被牵扯进来。

代价是真实存在、也必须说清的：如果未来的 Harness 版本给用户消息加了新 UI，这个渲染器不会自动继承。

## 插件市场上架

按 [awesome-dsh-plugin 贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
准备——DSH 插件市场读取的正是这份目录。

| 要求 | 状态 |
|---|---|
| `package.json` 声明 `dsh.bundle` | ✅ 同时声明了 `dsh.client.platform: web` |
| 旁边有 `cordis.patch.yml`，行内用包名引用 | ✅ |
| 真实可用的代码 | ✅ 57 个测试；全新 clone 可安装、可启动、通过浏览器验证 |
| 仓库添加 `dsh-plugin` topic | ⏳ 首次推送后在 GitHub 上设置 |
| 仓库创建满 1 天 | ⏳ 由仓库自身年龄满足 |
| 描述实事求是、无营销词 | ✅ 一行，每条声明都对得上已验证的行为 |
| 分类贴合实际做的事 | ✅ `ui`——输入框与对话呈现 |
| 官方 `@deepseek-ai/*` 用 `peerDependencies` 而非 `dependencies` | ✅ `dependencies` 里一个都没有；peer 为 optional 且范围带预发布分支 |
| 不是纯聚合包 | ✅ 自带行为 |

打包上有两点是刻意的：

- **构建产物 `client.js` 已提交进仓库。** 指南建议发 npm 或挂 release tarball，好让 git 安装跳过
  pnpm 的 `allowBuilds` 授权。直接提交构建产物殊途同归：`dsh plugin add github:…` 不跑任何构建，
  也就没有东西需要授权。挂 tarball 只会多出一个需要同步维护的发布物，没有额外收益，所以没做。
- **删掉了 `dsh.plugin.json`。** 包里原本有这么一个文件，但没有任何东西读它——Harness 加载器不读，
  市场也不读。清单契约是 `package.json#dsh`，而 `@deepseek-ai/dsh-package-manifest` 不接受这个键。

## 不适用

以下各项是核过之后有意不做的，写在这里以免后来的复核者把它读成疏漏：

- **`README.i18n.yaml`。** 这是本仓库的翻译配对记录：三个同级文件，各自保存双方完整的 git blob 哈希，
  由 `pnpm run verify-translation-pairing` 对 `docs/**` 与所有非 vendor 的 README 强制执行。
  这些哈希在本仓库之外没有意义，该门禁也不会作用到本包。
- **`./invariant` 伴生文件。** `@deepseek-ai/dsh-invariants` 面向的是拥有"持久关系（权威事件流与可变
  快照）"的包。本插件不拥有任何持久状态：它读草稿、渲染草稿。
- **`dsh.client.immediately`。** 它标记的是"工厂必须尽早注册"的行的一阶段预取屏障。预览是惰性 chrome，
  不需要它。
- **`dsh.compatibility`。** 它不是 `DshManifest` 的字段。本 profile 里安装的另一个同类 LaTeX 插件声明了它；
  schema 会忽略未知键，所以它是惰性的而非有害的——但它不属于契约的一部分。

## 验证

上述结论是被强制执行的，不是被声明的：

```sh
npm test        # 40 个测试
```

- 构建产物真实的 `require` 调用与 `dsh.client.external` 完全一致，因此清单不可能与代码脱节；
- 两套词典注册时键集合完全相同；
- 两个插槽条目都带 `locale: 'latex-preview'`；
- 渲染出的 dock 内含 `ui-primitives` 的输出（`data-tone`、stub 按钮），并且**不含**任何手写开关或分段控件。

```sh
node verify/drive.mjs '<tokenised-url>'
```

在 headless Chrome 里驱动真实 shell。最近一次运行报告 0 失败，覆盖：插件出现在客户端模块图中、
4 个公式成功排版且有 1 个行间块、聚焦台跟随光标、写坏的公式在发送前被标红、折叠条、设置面板、
悬停徽标弹出 shell 自己的 `role="tooltip"` 气泡——以及模型将收到的草稿与键入内容逐字节一致。
