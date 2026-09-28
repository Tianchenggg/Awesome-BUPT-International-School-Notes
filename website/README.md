# BUPT Study

北京邮电大学国际学院课程笔记学习站，配套 [Awesome BUPT International School Notes](https://github.com/Tianchenggg/Awesome-BUPT-International-School-Notes)。

- 17 门课程、199 个阅读章节。
- 189 道自测题，包含软件工程整理出的 61 道原有题目；其余课程各 8 道代表题。
- Markdown、公式、表格、插图和 Mermaid 图示全部在网站内部显示。
- 参考答案默认隐藏，支持作答草稿、自评、待复习筛选、打乱顺序和本轮总结。
- 阅读进度、草稿和掌握情况仅保存在当前浏览器，不需要注册登录。

## 本地运行

在笔记仓库的 `website` 目录中：

```sh
npm ci
npm run build
npm run dev
```

打开 `http://127.0.0.1:4173`。修改 `src` 或笔记后重新运行 `npm run build` 并刷新浏览器。

也可通过 `NOTES_ROOT=/absolute/path/to/notes-repository npm run build` 指定笔记仓库位置。构建读取各课程 Markdown 和配图，生成可独立部署的 `dist/`。数学和 Markdown 在构建时转换，浏览器按课程加载内容。

## 内容维护

- 笔记：修改仓库根目录下相应课程的 Markdown。
- 题库：修改 `content/questions.json`，每题包含 `course`、`prompt`、`answer`、`sourceHeading`、`type`；`sourceHeading` 必须与原笔记标题完全匹配。`type` 为 `concept` 或 `application`。
- 界面：`src/app.js`、`src/styles.css`、`src/index.html`。
- 题库是自测参考，不进行自动简答题评分。

视觉参考 QMplus 的课程布局，使用其同源的 Moodle 活动图标和 Font Awesome 导航图标。素材来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
