# 云小北 · React Native

多账号自动签到客户端的 React Native 跨平台实现（iOS / Android / Web）。
原 SwiftUI 项目：[lulaide/rollcall-ios](https://github.com/lulaide/rollcall-ios)。

## 技术选型

- **Expo SDK 54** + **Expo Router** + **React Native 0.81** + **React 19**（开启 New Architecture）
- **iOS 26 Liquid Glass**：通过 `expo-glass-effect` 调用系统 `UIGlassEffect`，老版本自动降级
- **VisionKit DataScanner**：自写 `modules/expo-data-scanner` 本地原生模块包 `DataScannerViewController`，保留原 SwiftUI 项目的扫码体验（QR-only、自动锁定、震动反馈）
- **状态管理**：Zustand + MMKV（待落地）
- **Web**：`react-native-web` + `expo-router` 静态导出

## 安装方式

### iOS（无开发者账号 → LiveContainer）

1. 在 LiveContainer / SideStore / AltStore 添加源：

   ```
   https://github.com/lulaide/rollcall-rn/releases/latest/download/source.json
   ```

2. 从源里安装"云小北"。

### Android

从 [Releases](https://github.com/lulaide/rollcall-rn/releases) 下载 `Yunxiaobei.apk`，允许"未知来源"安装。

### Web

直接访问 GitHub Pages 部署（每次 push main 自动更新）。

## 本地开发

```bash
npm install
npx expo start --web         # 浏览器预览
npx expo start --ios         # iOS 模拟器（需 macOS）
npx expo start --android     # Android 模拟器
```

## 发版

每次 push 到 `main` 触发 [GitHub Actions](.github/workflows/build.yml)：

- iOS：`expo prebuild` + `xcodebuild` 出 **未签名 IPA**
- Android：`assembleRelease` 出 APK
- Web：`expo export` 出静态站点 → GitHub Pages
- 全部挂到 `build-N` Release 上 + 生成 AltStore `source.json`

版本号沿用原项目规则：`1.0.${commit_count}`。

## License

MIT
