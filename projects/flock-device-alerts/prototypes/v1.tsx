/**
 * Device Alerts page.
 *
 * WHAT IT SHOWS
 *   A Flock Admin page: the title "Device Alerts and Updates", a one-line description, a warning alert ("3 devices
 *   are offline"), an info alert ("Firmware update available") and one primary button, "Review Devices". The button is extra large (size="xl") with fully rounded,
 *   pill-shaped corners, both asked for.
 *
 * WHERE IT SITS
 *   Admin, with Devices as the active sub-nav item (no "Device Alerts" nav item exists, and none is invented).
 *   Route not decided; a Devices-area route would be orgPaths('devices/alerts'), so /devices/alerts and
 *   /organization/:id/devices/alerts. The page has no neighbours.
 *
 * MODELLED ON
 *   src/components/role/rolesPage.tsx (page container padding 3, title and description, FSAlert directly below the
 *   title). Title and description markup copied from TitleDescription in src/components/shared/pageTitle.tsx.
 *
 * WHO THE NAVIGATION SHOWS
 *   A Flock admin, as in .dsnr/knowledge/references/admin-shell-roles-2026-10-06.png (sub-nav includes
 *   Organizations List). The "< Organization: ..." back link is left out: this page is not shown inside one
 *   organization.
 *
 * STATES  (?state=default)
 *   default             3 devices offline, a firmware update available, the button as asked. One screen only.
 *
 * MARKS
 *   @standin
 *     - Review Devices goes nowhere. No destination was given. A Devices page filtered to offline devices does not
 *       exist.
 *   @mock
 *     - The count of offline devices (3) and the firmware update notice.
 *     - The top-bar app links and account menus (copied from the 2026-10-06 reference, not from the account).
 *     - The sub-nav for a Flock admin (the real one is computed from permissions, flags and org type).
 *   @remove
 *     - The local copy of TitleDescription (the real module cannot be imported).
 *   @override
 *     - FSButton corners: fully rounded (pill), asked for; no size or variant gives it.
 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@flocksafety/flock-react-component-lib/build/style.css';

import {
    FSAlert,
    FSApp,
    FSBox,
    FSButton,
    FSStack,
    FSTypography,
    FSUniversalNav,
} from '@flocksafety/flock-react-component-lib';
import { useCallback } from 'react';

export const title = 'Device Alerts and Updates';

export const states = ['default'] as const;

// @mock: number of offline devices. On move: comes from the devices data.
const OFFLINE_DEVICE_COUNT = 3;

// @mock: top-bar links come from the signed-in account (loggedInUser.nav), which has no current fixture. Copied
// from .dsnr/knowledge/references/admin-shell-roles-2026-10-06.png.
const EXTERNAL_APP_LINKS = [
    'Search',
    'Alerts',
    'Patrol',
    'FlockOS',
    'Nova',
    'VMS',
    'Devices',
    'Sharing',
    'Insights',
    'Evidence',
    'Admin',
    'Planning Center',
].map((linkTitle) => ({ title: linkTitle, url: '#', isInternal: true }));

const HELP_ITEM = {
    title: 'Help',
    options: [
        { title: 'Help Center', url: '#' },
        { title: 'Contact Support', url: '#' },
    ],
};

const USER_DETAILS_ITEM = {
    title: 'Account',
    options: [{ title: 'Sign Out', url: '#' }],
};

// @mock: sub-nav for a Flock admin. On move: computed by useAdminSubNavItems from permissions, flags and org type.
const SUB_NAV_ITEMS = [
    'Profile',
    'Organizations List',
    'Organization',
    'Devices',
    'Roles',
    'Users',
    'Zones',
    'Transparency Portal',
    'Integrations',
    'Alerts & FlockOS',
    'Billing',
    'Contact Directory',
].map((itemTitle) => ({ title: itemTitle, value: `/${itemTitle}`, isBold: itemTitle === 'Devices' }));

// @remove: local copy of TitleDescription; pageTitle.tsx pulls Redux, Datadog, Segment and LaunchDarkly. On move:
// use PageTitle from ~components/shared/pageTitle.
const TitleDescription = ({ heading, description }: { heading: string; description: string }) => (
    <FSBox>
        <FSTypography variant="h4" component="h1" gutterBottom sx={{ marginTop: '0.75rem' }}>
            {heading}
        </FSTypography>
        <FSTypography gutterBottom>{description}</FSTypography>
    </FSBox>
);

const DeviceAlertsPage = () => {
    const noop = useCallback(() => undefined, []);

    return (
        <>
            <FSUniversalNav
                navbarTitle="Admin"
                logoHref="#"
                externalAppLinkItems={EXTERNAL_APP_LINKS}
                helpLinkItem={HELP_ITEM}
                userDetailsItem={USER_DETAILS_ITEM}
                activeAppLinkItems={SUB_NAV_ITEMS}
                activeAppNavigationHandler={noop}
            />
            <FSBox sx={{ padding: 3 }}>
                <FSStack spacing={2} alignItems="flex-start">
                    <FSBox data-e2e-ref="page-title">
                        <TitleDescription
                            heading={title}
                            description="Keep track of devices that need your attention."
                        />
                    </FSBox>
                    <FSBox sx={{ width: '100%' }} data-e2e-ref="offline-alert">
                        <FSAlert severity="warning">{`${OFFLINE_DEVICE_COUNT} devices are offline`}</FSAlert>
                    </FSBox>
                    {/* @mock: firmware update notice. On move: comes from the devices' firmware data. */}
                    <FSBox sx={{ width: '100%' }} data-e2e-ref="firmware-alert">
                        <FSAlert severity="info">Firmware update available</FSAlert>
                    </FSBox>
                    {/* @standin: Review Devices goes nowhere. On move: link to the Devices page; decide whether it opens
                        filtered to offline devices. */}
                    {/* @override: FSButton corners fully rounded (pill), asked for; no size or variant sets it. On move:
                        propose a pill shape to the design system if it should exist everywhere, else keep it here. */}
                    <FSButton variant="primary" size="xl" e2eRef="review-devices-button" sx={{ borderRadius: '9999px' }}>
                        Review Devices
                    </FSButton>
                </FSStack>
            </FSBox>
        </>
    );
};

export default function Page() {
    return (
        <FSApp>
            <div className="app-container">
                <DeviceAlertsPage />
            </div>
        </FSApp>
    );
}
