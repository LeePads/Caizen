package app.caizen.life;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Deterministic semantic IDs prevent duplicate native taps. */
public final class WidgetActionIds {
    private WidgetActionIds() {}

    public static String routineComplete(String profileId, String routineId, String occurrenceKey) {
        return forAction("routine.complete", profileId, routineId, occurrenceKey);
    }

    public static String taskComplete(String profileId, String taskId, String occurrenceKey) {
        return forAction("task.complete", profileId, taskId, occurrenceKey);
    }

    public static String workTaskComplete(String profileId, String taskId, String occurrenceKey) {
        return forAction("workTask.complete", profileId, taskId, occurrenceKey);
    }

    public static String forAction(
        String actionType,
        String profileId,
        String recordId,
        String occurrenceKey
    ) {
        return sha256(actionType + "\u001f" + profileId + "\u001f" + recordId + "\u001f" + occurrenceKey);
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte item : digest) result.append(String.format("%02x", item));
            return result.toString();
        } catch (Exception error) {
            // SHA-256 is required by every Android runtime; retain a bounded
            // deterministic fallback if a broken provider ever omits it.
            return Integer.toHexString(value.hashCode());
        }
    }
}
