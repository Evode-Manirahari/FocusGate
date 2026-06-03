import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

// Show urgent pushes even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Ask for notification permission and return the Expo push token.
 *
 * The token is what the backend pushes to. The urgent breakthrough only works if the
 * user grants notifications AND (on iOS) leaves Time Sensitive notifications allowed
 * for FocusGate — the app declares the Time Sensitive entitlement in app.json.
 */
export async function registerForPushToken(): Promise<string> {
  if (!Device.isDevice) {
    throw new Error("Push notifications require a physical device (not a simulator).");
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: true },
    });
    status = req.status;
  }
  if (status !== "granted") {
    throw new Error("Notification permission not granted.");
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("urgent", {
      name: "Urgent work messages",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}
