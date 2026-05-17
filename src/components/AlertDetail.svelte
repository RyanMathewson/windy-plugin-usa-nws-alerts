<div class="detail-view size-s">
    <div
        class="alert detail-alert"
        style:border-left-color={colorFromSeverity(alert.severity)}
    >
        <div class="size-l mb-5">
            {alert.event}
        </div>
        <div class="mb-10">
            {alert.headline}
        </div>
        <div class="metadata-grid mb-10">
            <div>Severity: {alert.severity}</div>
            <div>Certainty: {alert.certainty}</div>
            <div>Urgency: {alert.urgency}</div>
            <div>Sent: {formatDate(alert.sent)}</div>
        </div>
        <div class="mb-5">
            Area: {alert.areaDesc}
        </div>
        <div class="mb-10">
            Time: {formatDate(alert.effective)} - {formatDate(alert.expires)}
        </div>
        <div class="mb-10">
            Sender: {alert.senderName} ({alert.sender})
        </div>
        <div class="message-block mb-10">
            <div class="message-label">Description</div>
            <div>{alert.description}</div>
        </div>
        <div class="message-block">
            <div class="message-label">Instruction</div>
            <div>{alert.instruction ?? 'None'}</div>
        </div>
    </div>
</div>

<script lang="ts">
    import { colorFromSeverity, formatDate } from '../scripts/alertUtils';
    import type { DisplayedAlert } from '../scripts/alertTypes';

    export let alert: DisplayedAlert;
</script>
