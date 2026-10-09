/**
 * Zone Coverage, version 3: version 2 (zone cards grouped by health) plus a "Fix" action on every offline camera.
 *
 * WHAT IT SHOWS
 *   Everything from version 2, unchanged: the Zones page frame with the [Zones] [Zone Coverage] tabs, zone cards grouped
 *   by health worst first (Offline, Degraded, Healthy), the health rules, search, the "Has offline cameras" filter and the
 *   filtered empty state. New in this version: each offline camera listed on a card has a "Fix" button. Fix opens a
 *   small side panel (the product's drawer) for that camera with three things: when it was last seen, its network
 *   status, and a "Notify the site contact" button. The button sends nothing: it shows a confirmation that says so.
 *   The panel has three outcomes, all mocked: details shown, no details for this camera (empty), and details failed
 *   to load (error, with Retry; Retry shows a skeleton and then the details).
 *
 * KEYBOARD
 *   Opening the panel moves focus into it. Tab stays inside it. Escape or the Close button closes it, and focus goes
 *   back to the Fix button that opened it.
 *
 * HOW HEALTH IS DERIVED  (assumption, not a product rule; same as version 2)
 *   Offline  = every camera in the zone is offline.
 *   Degraded = some cameras in the zone are offline, but not all.
 *   Healthy  = no camera in the zone is offline.
 *   A zone with no cameras is not in the mock data; this file would call it Healthy, which is probably wrong.
 *   Needs a product decision before this moves into the code.
 *
 * WHERE IT SITS
 *   Admin > Zones, as a second tab beside the existing zone list: [Zones] [Zone Coverage]. The Zones item in the
 *   sub-nav stays the active one. The real Zones route (/zones, /organization/:id/zones) has no tabs today. The panel
 *   opens over the page from the right edge.
 *
 * MODELLED ON
 *   Everything from version 2: src/components/zones/zonesList.tsx (page frame, count header, empty state layout),
 *   src/components/role/rolesList/rolesListSlotComponents.tsx (search, "{n} of {total}" count, filtered-empty state),
 *   src/components/alerts/alertsPage.tsx (FSTabs under the page title),
 *   src/components/integrationsPage/integrationCard/index.tsx (the card),
 *   .flkd/product-patterns/pattern-inventory.md "Status display" (FSChip variant="status").
 *   The side panel: FSDrawer + FSDrawerHeader + FSDrawerContent, opened the way
 *   src/components/role/rolesList/rolesListFiltersDrawer.tsx opens its drawer (anchor="right", size, header with Close).
 *   Panel error: pattern-inventory.md "Errors" (FSAlert severity="error" with a Retry FSAlertButton).
 *   Panel loading: a skeleton shaped like the details (interaction-states.md).
 *
 * WHO THE NAVIGATION SHOWS
 *   A customer's own org admin (not a Flock admin): no "Organizations List" in the sub-nav and no "< Organization" back
 *   link. Top bar and the rest of the sub-nav are from .flkd/knowledge/references/admin-shell-roles-2026-10-06.png.
 *   Billing and Contact Directory are kept from that reference, but they depend on the billing permission, so a
 *   customer admin may not see them.
 *
 * STATES  (?state=default | filtered | panel | missing | failed)
 *   default      all 14 zones, no search, no filter: 2 offline, 4 degraded, 8 healthy. Fix works on every offline
 *                camera and shows details.
 *   filtered     search "Riverside" with "Has offline cameras" on. Riverside has no offline cameras, so nothing matches.
 *   panel        the panel open on Jefferson Elementary Front (School Zone South), details shown.
 *   missing      the panel open with no details for the camera. Fix on any camera shows this in this state.
 *   failed       the panel open with the details failing to load. Fix on any camera shows this in this state; Retry
 *                loads them.
 *
 * MARKS
 *   @standin
 *     - The Zone Coverage tab and page. The product has no zone coverage view today, and the Zones page has no tabs.
 *     - Zone health (Offline / Degraded / Healthy), and the grouping by it. The product has no zone health.
 *     - The offline camera list on a card, and "offline for ..." per camera. The product has devices, but nothing that
 *       gives a zone its cameras or how long each has been offline.
 *     - Camera counts and last alert per zone. No endpoint returns them.
 *     - Zone cards. Coke's zone list is a table; its cards are on the Integrations page and the add-on cards, none
 *       for a zone. The card is built from FSCard the way the integration card is.
 *     - The "Has offline cameras" checkbox. Coke's list filters sit in a Filters drawer; one yes/no filter is shown
 *       inline instead. With the cards grouped by health it only hides the Healthy group.
 *     - The empty state's Clear Filters action. The product's filtered-empty state is one line with no action.
 *     - The "Fix" button and the camera panel. The product has no per-camera fix flow. The panel itself is the real
 *       FSDrawer; what is in it is not a product screen.
 *     - "Notify the site contact". Nothing in the product notifies a site contact. The button sends nothing and says
 *       so on screen; engineering has to decide what it triggers and who the site contact is.
 *     - The panel's network status and last-seen values. No endpoint returns them.
 *   @mock
 *     - The zones, camera counts, offline camera names, how long each has been offline, and alert dates.
 *     - Each camera's last-seen time (worked out from how long it has been offline) and network status.
 *     - The site contact names and roles.
 *     - The panel's loading delay, the empty and error outcomes, and the Notify delay and confirmation.
 *     - "Now" (2026-10-08) and the organization.
 *     - The top-bar app links and account menus (copied from the 2026-10-06 reference, not from the account).
 *     - The Admin sub-nav (a customer admin's; computed from permissions in the real app).
 *   @remove
 *     - Picking the state from ?state= (readState). The bar above the page offers the states.
 *     - The sub-nav handler and the tab handler that do nothing (there is no zone list to switch to).
 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@flocksafety/flock-react-component-lib/build/style.css';

import {
    FSAlert,
    FSAlertButton,
    FSApp,
    FSBox,
    FSButton,
    FSCard,
    FSCheckbox,
    FSChip,
    FSDrawer,
    FSDrawerContent,
    FSDrawerHeader,
    FSGrid,
    FSLoadingButton,
    FSSkeleton,
    FSStack,
    FSSymbol,
    FSTab,
    FSTabs,
    FSTextField,
    FSTypography,
    FSUniversalNav,
} from '@flocksafety/flock-react-component-lib';
import InputAdornment from '@mui/material/InputAdornment';
import { useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------------------------------------------

type Health = 'offline' | 'degraded' | 'healthy';

type OfflineCamera = { id: string; name: string; offlineFor: number };

type Zone = {
    id: string;
    name: string;
    cameras: number;
    offlineCameras: OfflineCamera[];
    lastAlertAt: number | null;
    health: Health;
};

// @mock: "now". On move: not needed, the endpoint returns the dates.
const NOW = Date.UTC(2026, 9, 8, 15, 30);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// @standin: how a zone's health is worked out. No product rule exists. On move: decide the rule with product (is a
// zone with a few offline cameras "degraded", or is there a threshold?) and compute it in Crown, not in the browser.
const healthOf = (cameras: number, offline: number): Health => {
    if (offline === 0) {
        return 'healthy';
    }
    return offline >= cameras ? 'offline' : 'degraded';
};

// @standin: per-zone camera count, offline camera names, how long each has been offline, and last alert. No endpoint
// returns them. On move: add them to the zones response in Crown, or a coverage endpoint; offline must come from the
// same device status the Devices page uses.
// @mock: zones. `ago` is time before NOW; null means the zone has never had an alert. Each offline entry is
// [camera name, minutes offline].
type ZoneSeed = { name: string; cameras: number; offline: [string, number][]; ago: number | null };
const ZONE_SEEDS: ZoneSeed[] = [
    {
        name: 'Downtown Core',
        cameras: 18,
        offline: [
            ['Main St & 4th Ave NB', 3 * HOUR],
            ['Main St & 4th Ave SB', 3 * HOUR],
            ['Courthouse Garage Entry', 2 * DAY + 5 * HOUR],
        ],
        ago: 2 * HOUR,
    },
    {
        name: 'Harbor Park',
        cameras: 9,
        offline: [
            ['Pier 2 Boat Ramp', 6 * DAY],
            ['Harbor Park Lot B', 20 * HOUR],
        ],
        ago: 1 * DAY + 4 * HOUR,
    },
    {
        name: 'Westgate Shopping Center',
        cameras: 12,
        offline: [['Westgate Blvd East Exit', 45 * MINUTE]],
        ago: 5 * HOUR,
    },
    { name: 'Riverside District', cameras: 14, offline: [], ago: 3 * DAY },
    { name: 'Lakeview Residential', cameras: 7, offline: [], ago: 9 * DAY + 6 * HOUR },
    {
        name: 'County Road 12 Corridor',
        cameras: 6,
        offline: [
            ['CR-12 Mile Marker 3', 4 * DAY],
            ['CR-12 Mile Marker 5', 4 * DAY],
            ['CR-12 & Quarry Rd', 11 * DAY],
            ['CR-12 Mile Marker 8', 12 * HOUR],
        ],
        ago: 21 * DAY,
    },
    { name: 'School Zone North', cameras: 5, offline: [], ago: 12 * DAY },
    {
        name: 'School Zone South',
        cameras: 4,
        offline: [
            ['Jefferson Elementary Front', 1 * DAY + 2 * HOUR],
            ['Jefferson Elementary Pickup Loop', 1 * DAY + 2 * HOUR],
            ['Jefferson Elementary Bus Lane', 1 * DAY + 2 * HOUR],
            ['Oak Ave Crosswalk', 7 * HOUR],
        ],
        ago: 33 * DAY,
    },
    { name: 'Elm Street Business Strip', cameras: 8, offline: [], ago: 6 * HOUR },
    { name: 'Industrial Park', cameras: 11, offline: [], ago: 17 * DAY },
    { name: 'Municipal Complex', cameras: 6, offline: [], ago: 2 * DAY + 9 * HOUR },
    {
        name: 'Mill Road Bridge',
        cameras: 3,
        offline: [
            ['Mill Rd Bridge West', 3 * DAY + 8 * HOUR],
            ['Mill Rd Bridge East', 3 * DAY + 8 * HOUR],
            ['Mill Rd & Canal St', 3 * DAY + 8 * HOUR],
        ],
        ago: null,
    },
    { name: 'Fairgrounds', cameras: 10, offline: [], ago: 58 * DAY },
    { name: 'Oak Hill Neighborhood', cameras: 5, offline: [], ago: 4 * DAY + 2 * HOUR },
];

const ZONES: Zone[] = ZONE_SEEDS.map((seed, i) => ({
    id: `zone-${i + 1}`,
    name: seed.name,
    cameras: seed.cameras,
    offlineCameras: seed.offline.map(([name, offlineFor], j) => ({ id: `zone-${i + 1}-cam-${j + 1}`, name, offlineFor })),
    lastAlertAt: seed.ago === null ? null : NOW - seed.ago,
    health: healthOf(seed.cameras, seed.offline.length),
}));

const formatLastAlert = (ms: number) =>
    new Date(ms).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
    });

const pluralize = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const formatOfflineFor = (ms: number) => {
    if (ms >= DAY) {
        return pluralize(Math.floor(ms / DAY), 'day');
    }
    if (ms >= HOUR) {
        return pluralize(Math.floor(ms / HOUR), 'hour');
    }
    return pluralize(Math.max(1, Math.floor(ms / MINUTE)), 'minute');
};

// @mock: top-bar links come from the signed-in account (loggedInUser.nav), which has no current fixture. Copied
// from .flkd/knowledge/references/admin-shell-roles-2026-10-06.png.
const EXTERNAL_APP_LINKS = [
    'Search', 'Alerts', 'Patrol', 'FlockOS', 'Nova', 'VMS', 'Devices', 'Sharing', 'Insights', 'Evidence', 'Admin',
    'Planning Center',
].map((title) => ({ title, url: '#', isInternal: true }));

const HELP_ITEM = {
    title: 'Help',
    options: [{ title: 'Help Center', url: '#' }, { title: 'Contact Support', url: '#' }],
};
const USER_DETAILS_ITEM = {
    title: 'Account',
    options: [{ title: 'Sign Out', url: '#' }],
};

// @mock: sub-nav for a customer's own org admin. On move: computed by useAdminSubNavItems from permissions.
const SUB_NAV_ITEMS = [
    'Profile', 'Organization', 'Devices', 'Roles', 'Users', 'Zones', 'Transparency Portal', 'Integrations',
    'Alerts & FlockOS', 'Billing', 'Contact Directory',
].map((title) => ({ title, value: `/${title}`, isBold: title === 'Zones' }));

// ---------------------------------------------------------------------------------------------------------------
// Zone cards
// ---------------------------------------------------------------------------------------------------------------

const GROUPS: { health: Health; title: string; chipColor: 'error' | 'warning' | 'success' }[] = [
    { health: 'offline', title: 'Offline', chipColor: 'error' },
    { health: 'degraded', title: 'Degraded', chipColor: 'warning' },
    { health: 'healthy', title: 'Healthy', chipColor: 'success' },
];

const COLLAPSED_CAMERAS = 3;

const summaryOf = (zone: Zone) => {
    const offline = zone.offlineCameras.length;
    if (zone.health === 'offline') {
        return `All ${zone.cameras} cameras offline`;
    }
    if (zone.health === 'degraded') {
        return `${offline} of ${zone.cameras} cameras offline`;
    }
    return `All ${zone.cameras} cameras online`;
};

const OfflineCameraList = ({ zone, onFix }: { zone: Zone; onFix: (target: PanelTarget) => void }) => {
    const [expanded, setExpanded] = useState(false);
    const hidden = Math.max(0, zone.offlineCameras.length - COLLAPSED_CAMERAS);
    const shown = expanded ? zone.offlineCameras : zone.offlineCameras.slice(0, COLLAPSED_CAMERAS);
    const listId = `${zone.id}-offline-cameras`;

    return (
        <FSBox data-e2e-ref="offline-camera-list">
            <FSTypography variant="caption" color="text.secondary" id={`${listId}-label`}>
                Offline Cameras
            </FSTypography>
            <FSBox
                component="ul"
                id={listId}
                aria-labelledby={`${listId}-label`}
                sx={{ listStyle: 'none', m: 0, p: 0 }}
            >
                {shown.map((camera) => (
                    <FSStack
                        key={camera.id}
                        component="li"
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ py: 0.5 }}
                    >
                        <FSSymbol
                            name="videocam_off"
                            aria-hidden="true"
                            sx={({ palette }) => ({ width: '20px', height: '20px', flexShrink: 0, overflow: 'hidden', color: palette.error.main })}
                        />
                        <FSTypography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                            {camera.name}
                        </FSTypography>
                        <FSBox flexGrow={1} />
                        <FSTypography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                            {formatOfflineFor(camera.offlineFor)}
                        </FSTypography>
                        {/* @standin: Fix action. The product has no per-camera fix flow. On move: decide what Fix opens. */}
                        <FSButton
                            variant="ghost"
                            size="sm"
                            onClick={() => onFix({ zone, camera })}
                            aria-label={`Fix ${camera.name}`}
                            aria-haspopup="dialog"
                            data-e2e-ref={`fix-${camera.id}`}
                        >
                            Fix
                        </FSButton>
                    </FSStack>
                ))}
            </FSBox>
            {hidden > 0 && (
                <FSButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    aria-controls={listId}
                    data-e2e-ref="show-more-cameras-button"
                    sx={{ mt: 0.5 }}
                >
                    {expanded ? 'Show Fewer' : `Show ${hidden} More`}
                </FSButton>
            )}
        </FSBox>
    );
};

const ZoneCard = ({
    zone,
    chipColor,
    healthTitle,
    onFix,
}: {
    zone: Zone;
    chipColor: 'error' | 'warning' | 'success';
    healthTitle: string;
    onFix: (target: PanelTarget) => void;
}) => (
    <FSCard
        variant="outlined"
        component="li"
        data-e2e-ref={`zone-card-${zone.id}`}
        sx={{
            backgroundColor: 'surface0.main',
            padding: 2,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
        }}
    >
        <FSBox>
            <FSChip variant="status" size="small" color={chipColor} label={healthTitle} data-e2e-ref="zone-health-chip" />
        </FSBox>
        <FSBox>
            <FSTypography variant="subtitle1" component="h3">
                {zone.name}
            </FSTypography>
            <FSTypography variant="body2" color="text.secondary">
                {summaryOf(zone)}
            </FSTypography>
        </FSBox>
        {zone.offlineCameras.length > 0 && <OfflineCameraList zone={zone} onFix={onFix} />}
        <FSBox flexGrow={1} />
        <FSTypography variant="caption" color="text.secondary">
            {zone.lastAlertAt === null ? 'No alerts yet' : `Last alert ${formatLastAlert(zone.lastAlertAt)}`}
        </FSTypography>
    </FSCard>
);

// ---------------------------------------------------------------------------------------------------------------
// Camera panel (opened by Fix)
// ---------------------------------------------------------------------------------------------------------------

type PanelTarget = { zone: Zone; camera: OfflineCamera };
type PanelOutcome = 'details' | 'empty' | 'error';

type NetworkStatus = { label: string; color: 'error' | 'warning'; detail: string };
type SiteContact = { name: string; role: string };

// @mock: site contacts. No site contact exists in the product. On move: decide where a zone's contact comes from.
const SITE_CONTACTS: SiteContact[] = [
    { name: 'Dana Whitfield', role: 'Public Works' },
    { name: 'Marcus Bell', role: 'Facilities' },
    { name: 'Priya Raman', role: 'City IT' },
    { name: 'Tom Okafor', role: 'Parks and Recreation' },
];

const siteContactOf = (zone: Zone) => SITE_CONTACTS[Number(zone.id.replace('zone-', '')) % SITE_CONTACTS.length];

// @standin: last seen and network status. No endpoint returns them. On move: read them from the same device status
// the Devices page uses, and let Crown return the network status text instead of working it out here.
const lastSeenOf = (camera: OfflineCamera) => NOW - camera.offlineFor;

const networkStatusOf = (camera: OfflineCamera): NetworkStatus =>
    camera.offlineFor < HOUR
        ? { label: 'Reconnecting', color: 'warning', detail: 'The camera is trying to reconnect and is not back online yet.' }
        : { label: 'Not reachable', color: 'error', detail: 'The camera has not answered any check-ins since it was last seen.' };

const visuallyHidden = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
} as const;

const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <FSBox>
        <FSTypography variant="caption" color="text.secondary" component="dt">
            {label}
        </FSTypography>
        <FSBox component="dd" sx={{ m: 0 }}>
            {children}
        </FSBox>
    </FSBox>
);

// @standin: Notify the site contact. It sends nothing. On move: engineering decides what it triggers (email, SMS or a
// ticket), who the site contact is, and what happens when it fails; then replace the timer with the real request.
const NotifySiteContact = ({ target, contact }: { target: PanelTarget; contact: SiteContact }) => {
    const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
    const timer = useRef<number>();
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const notify = () => {
        setStatus('sending');
        // @mock: a short wait, then a confirmation. Nothing is sent.
        timer.current = window.setTimeout(() => setStatus('sent'), 800);
    };

    return (
        <FSStack spacing={1.5} data-e2e-ref="notify-site-contact">
            {status === 'sent' && (
                <FSAlert severity="success" data-e2e-ref="notify-confirmation">
                    {`Confirmed (simulated): ${contact.name} would be told that ${target.camera.name} is offline. Nothing was sent.`}
                </FSAlert>
            )}
            <FSBox>
                <FSLoadingButton
                    variant="primary"
                    loading={status === 'sending'}
                    onClick={notify}
                    data-e2e-ref="notify-site-contact-button"
                >
                    Notify the Site Contact
                </FSLoadingButton>
            </FSBox>
            <FSTypography variant="caption" color="text.secondary" data-e2e-ref="notify-standin-label">
                Prototype stand-in for engineering: this button sends nothing. The notification service is not connected.
            </FSTypography>
        </FSStack>
    );
};

const CameraDetailsSkeleton = () => (
    <FSStack spacing={3} data-e2e-ref="camera-panel-loading">
        <FSBox role="status" sx={visuallyHidden}>
            Loading camera details
        </FSBox>
        {[0, 1, 2].map((row) => (
            <FSBox key={row} aria-hidden="true">
                <FSSkeleton variant="text" width={90} height={20} />
                <FSSkeleton variant="text" width="70%" height={28} />
            </FSBox>
        ))}
        <FSSkeleton variant="rounded" width={200} height={40} aria-hidden="true" />
    </FSStack>
);

const CameraDetails = ({ target }: { target: PanelTarget }) => {
    const network = networkStatusOf(target.camera);
    const contact = siteContactOf(target.zone);
    const lastSeen = lastSeenOf(target.camera);
    return (
        <FSStack spacing={3} data-e2e-ref="camera-panel-details">
            <FSBox component="dl" sx={{ m: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <DetailRow label="Last Seen">
                    <FSTypography variant="body1" data-e2e-ref="camera-last-seen">
                        {formatLastAlert(lastSeen)}
                    </FSTypography>
                    <FSTypography variant="body2" color="text.secondary">
                        {`${formatOfflineFor(target.camera.offlineFor)} ago`}
                    </FSTypography>
                </DetailRow>
                <DetailRow label="Network Status">
                    <FSBox sx={{ mb: 0.5 }}>
                        <FSChip
                            variant="status"
                            size="small"
                            color={network.color}
                            label={network.label}
                            data-e2e-ref="camera-network-status"
                        />
                    </FSBox>
                    <FSTypography variant="body2" color="text.secondary">
                        {network.detail}
                    </FSTypography>
                </DetailRow>
                <DetailRow label="Site Contact">
                    <FSTypography variant="body1">{contact.name}</FSTypography>
                    <FSTypography variant="body2" color="text.secondary">
                        {contact.role}
                    </FSTypography>
                </DetailRow>
            </FSBox>
            <NotifySiteContact target={target} contact={contact} />
        </FSStack>
    );
};

// Follows the product's centred empty state, with the one action that still works: asking the site contact.
const CameraDetailsEmpty = ({ target }: { target: PanelTarget }) => (
    <FSStack spacing={3} data-e2e-ref="camera-panel-empty">
        <FSStack spacing={1.5} alignItems="center" textAlign="center" sx={{ pt: 2 }}>
            <FSSymbol name="sensors_off" aria-hidden="true" sx={{ width: '36px', height: '36px', color: 'outline.main' }} />
            <FSTypography sx={{ fontWeight: 600, fontSize: 16 }}>No Details For This Camera</FSTypography>
            <FSTypography sx={{ fontSize: 14, maxWidth: '340px' }}>
                {`${target.camera.name} has no check-in history to show. It may have been installed recently or never connected. Ask the site contact to look at it on site.`}
            </FSTypography>
        </FSStack>
        <NotifySiteContact target={target} contact={siteContactOf(target.zone)} />
    </FSStack>
);

const CameraPanel = ({
    target,
    open,
    outcome,
    loading,
    onClose,
    onRetry,
}: {
    target: PanelTarget | null;
    open: boolean;
    outcome: PanelOutcome;
    loading: boolean;
    onClose: () => void;
    onRetry: () => void;
}) => (
    <FSDrawer
        anchor="right"
        open={open}
        onClose={onClose}
        size="slim"
        // The page puts focus back on the Fix button itself, so it also works when a state opens the panel.
        ModalProps={{ disableRestoreFocus: true }}
        PaperProps={{ role: 'dialog', 'aria-modal': true, 'aria-label': target ? `Fix ${target.camera.name}` : 'Fix camera' }}
    >
        {target && (
            <FSBox data-e2e-ref="camera-panel" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
                <FSDrawerHeader title={target.camera.name} subheader={target.zone.name} onClose={onClose} />
                <FSDrawerContent>
                    <FSBox aria-live="polite" aria-busy={loading}>
                        {loading ? (
                            <CameraDetailsSkeleton />
                        ) : outcome === 'error' ? (
                            <FSAlert
                                severity="error"
                                action={<FSAlertButton onClick={onRetry}>Retry</FSAlertButton>}
                                data-e2e-ref="camera-panel-error"
                            >
                                {`We could not load the details for ${target.camera.name}. Try again.`}
                            </FSAlert>
                        ) : outcome === 'empty' ? (
                            <CameraDetailsEmpty target={target} />
                        ) : (
                            <CameraDetails target={target} />
                        )}
                    </FSBox>
                </FSDrawerContent>
            </FSBox>
        )}
    </FSDrawer>
);

// Filtered-empty. Follows the product's centred empty state.
const NoMatchingZones = ({ onClear }: { onClear: () => void }) => (
    <FSGrid
        container
        direction="column"
        alignItems="center"
        justifyContent="center"
        spacing={2}
        sx={{ mt: 4 }}
        data-e2e-ref="empty-state"
    >
        <FSGrid item>
            <FSSymbol name="search_off" aria-hidden="true" sx={{ width: '36px', height: '36px', color: 'outline.main' }} />
        </FSGrid>
        <FSGrid item>
            <FSTypography sx={{ fontWeight: 600, fontSize: 16 }}>No Zones Found</FSTypography>
        </FSGrid>
        <FSGrid item>
            <FSTypography sx={{ fontSize: 14, maxWidth: '340px', textAlign: 'center' }}>
                No zones match your search and filter. Clear them to see every zone.
            </FSTypography>
        </FSGrid>
        <FSGrid item>
            <FSButton variant="secondary" onClick={onClear} data-e2e-ref="clear-filters-button">
                Clear Filters
            </FSButton>
        </FSGrid>
    </FSGrid>
);

// ---------------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------------

// The states, for the bar above the page to offer; the first is what the page opens in.
export const states = ['default', 'filtered', 'panel', 'missing', 'failed'] as const;
type PageState = (typeof states)[number];

// @remove: picks the state from ?state=. On move: delete.
const readState = (): PageState => {
    const value = new URLSearchParams(window.location.search).get('state');
    return states.includes(value as PageState) ? (value as PageState) : states[0];
};

const ZoneCoveragePage = ({ initialState }: { initialState: PageState }) => {
    const [search, setSearch] = useState(initialState === 'filtered' ? 'Riverside' : '');
    const [offlineOnly, setOfflineOnly] = useState(initialState === 'filtered');

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return ZONES.filter(
            (z) => (!term || z.name.toLowerCase().includes(term)) && (!offlineOnly || z.offlineCameras.length > 0),
        );
    }, [search, offlineOnly]);

    // The states with the panel open: it is shown with its details, with none, or failing to load.
    const panelState = initialState === 'panel' || initialState === 'missing' || initialState === 'failed';
    // @mock: the camera the panel is open on in the panel states: the first offline camera on the page.
    const [panelTarget, setPanelTarget] = useState<PanelTarget | null>(() => {
        if (!panelState) {
            return null;
        }
        const zone = ZONES.find((z) => z.id === 'zone-8');
        const camera = zone?.offlineCameras[0];
        return zone && camera ? { zone, camera } : null;
    });
    const [panelOpen, setPanelOpen] = useState(panelState);
    // @mock: what the panel's details request returns. In the missing and failed states every camera does that.
    const [outcome, setOutcome] = useState<PanelOutcome>(
        initialState === 'missing' ? 'empty' : initialState === 'failed' ? 'error' : 'details',
    );
    const [panelLoading, setPanelLoading] = useState(false);
    const retryTimer = useRef<number>();
    useEffect(() => () => window.clearTimeout(retryTimer.current), []);

    const openPanel = (target: PanelTarget) => {
        setPanelTarget(target);
        setPanelOpen(true);
    };
    const closePanel = () => {
        setPanelOpen(false);
        const cameraId = panelTarget?.camera.id;
        window.setTimeout(
            () => document.querySelector<HTMLElement>(`[data-e2e-ref="fix-${cameraId}"]`)?.focus(),
            0,
        );
    };
    const retryPanel = () => {
        setPanelLoading(true);
        // @mock: the retry works. A short wait, then the details.
        retryTimer.current = window.setTimeout(() => {
            setOutcome('details');
            setPanelLoading(false);
        }, 900);
    };

    const isEmpty = visible.length === 0;
    const clearFilters = () => {
        setSearch('');
        setOfflineOnly(false);
    };

    return (
        <>
            <FSUniversalNav
                navbarTitle="Admin"
                logoHref="#"
                externalAppLinkItems={EXTERNAL_APP_LINKS}
                helpLinkItem={HELP_ITEM}
                userDetailsItem={USER_DETAILS_ITEM}
                activeAppLinkItems={SUB_NAV_ITEMS}
                // @remove: the sub-nav does nothing in the prototype. On move: delete.
                activeAppNavigationHandler={() => undefined}
            />
            <FSStack sx={{ padding: 3 }} spacing={1.5}>
                {/* Recreated locally: the real PageTitle pulls in Redux, analytics and permissions. */}
                <FSBox sx={{ marginBottom: '1.25rem' }}>
                    <FSTypography variant="h4" component="h1" gutterBottom sx={{ marginTop: '0.75rem' }}>
                        Zones
                    </FSTypography>
                    <FSTypography variant="body2" color="text.secondary">
                        Create and manage geo-defined areas of interest for your organization.
                    </FSTypography>
                </FSBox>

                {/* @standin: tabs on the Zones page. The real page has none. On move: decide tabs or a separate route. */}
                <FSBox sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    {/* @remove: the tab handler does nothing; there is no zone list in the prototype. On move: delete. */}
                    <FSTabs value="coverage" onChange={() => undefined} aria-label="Zones Tabs">
                        <FSTab label="Zones" value="list" />
                        <FSTab label="Zone Coverage" value="coverage" data-e2e-ref="zone-coverage-tab" />
                    </FSTabs>
                </FSBox>

                <FSStack spacing={1} data-e2e-ref="zones-toolbar">
                    <FSStack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                        <FSTextField
                            value={search}
                            onChange={setSearch}
                            placeholder="Search..."
                            size="search"
                            data-e2e-ref="zone-search"
                            inputProps={{ 'aria-label': 'Search zones' }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <FSSymbol name="search" aria-hidden="true" />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ width: { xs: '100%', sm: '565px' } }}
                        />
                        {/* @standin: inline checkbox filter. Coke's filters live in a Filters drawer. On move: put it there if the drawer is used. */}
                        <FSCheckbox
                            label="Has offline cameras"
                            checked={offlineOnly}
                            onChange={(_e, checked) => setOfflineOnly(checked)}
                            data-e2e-ref="has-offline-filter"
                        />
                    </FSStack>
                    <FSTypography variant="h6" aria-live="polite" data-e2e-ref="zones-count">
                        {visible.length < ZONES.length ? `${visible.length} of ${ZONES.length} Zones` : `${ZONES.length} Zones`}
                    </FSTypography>
                </FSStack>

                {isEmpty ? (
                    <NoMatchingZones onClear={clearFilters} />
                ) : (
                    <FSStack spacing={3} data-e2e-ref="zone-groups">
                        {GROUPS.map(({ health, title, chipColor }) => {
                            const zones = visible.filter((z) => z.health === health);
                            if (zones.length === 0) {
                                return null;
                            }
                            return (
                                <FSBox key={health} component="section" data-e2e-ref={`${health}-group`} aria-labelledby={`${health}-group-title`}>
                                    <FSTypography variant="h6" component="h2" id={`${health}-group-title`} sx={{ mb: 1.5 }}>
                                        {`${title} (${zones.length})`}
                                    </FSTypography>
                                    <FSBox
                                        component="ul"
                                        sx={{
                                            listStyle: 'none',
                                            m: 0,
                                            p: 0,
                                            display: 'grid',
                                            gap: 2,
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                                        }}
                                    >
                                        {zones.map((zone) => (
                                            <ZoneCard key={zone.id} zone={zone} chipColor={chipColor} healthTitle={title} onFix={openPanel} />
                                        ))}
                                    </FSBox>
                                </FSBox>
                            );
                        })}
                    </FSStack>
                )}
            </FSStack>
            <CameraPanel
                target={panelTarget}
                open={panelOpen}
                outcome={outcome}
                loading={panelLoading}
                onClose={closePanel}
                onRetry={retryPanel}
            />
        </>
    );
};

export default function Page() {
    const pageState = readState();

    return (
        <FSApp>
            <div className="app-container">
                <ZoneCoveragePage initialState={pageState} />
            </div>
        </FSApp>
    );
}
