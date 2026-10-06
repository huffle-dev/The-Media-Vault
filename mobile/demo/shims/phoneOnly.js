// Phone-only libraries stood in for in the browser demo: the camera, the share sheet, the hidden web
// view, the photo picker and image editor. They render nothing / do nothing.
import React from "react";

// expo-camera
export const CameraView = () => null;
export const useCameraPermissions = () => [{ granted: false, canAskAgain: false }, async () => ({ granted: false })];

// expo-share-intent
export const ShareIntentProvider = ({ children }) => React.createElement(React.Fragment, null, children);
export const useShareIntentContext = () => ({ hasShareIntent: false, shareIntent: null, resetShareIntent: () => {} });

// react-native-webview
export const WebView = () => null;

// expo-image-picker
export const launchImageLibraryAsync = async () => ({ canceled: true, assets: [] });
export const launchCameraAsync = async () => ({ canceled: true, assets: [] });
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: false });
export const MediaTypeOptions = { Images: "images" };

// expo-image-manipulator
export const SaveFormat = { JPEG: "jpeg", PNG: "png" };
export const ImageManipulator = { manipulate: () => ({ resize() { return this; }, crop() { return this; }, renderAsync: async () => ({ saveAsync: async () => ({ uri: "" }) }) }) };
