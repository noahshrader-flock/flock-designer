/**
 * Organization page, Policies tab, as redrawn in the Q3 2026 SHARC refinement (Figma node 8914:85777).
 *
 * WHAT IT SHOWS
 *   The Policies tab for "Indianapolis Metro - PD", in two groups under one title:
 *     1. My Agency: LPR Policy (Add), Sharing MOU (Add), Policy Report (Download); then Federal Sharing (a toggle)
 *        and Search Filters (Immigration, Reproductive Health toggles, each with who last changed it).
 *     2. State: the Illinois State Policy, with the full Affirm / Deny wording open on the page, a notice that the
 *        choice cannot be undone, and the Acknowledgement select. It reads "Affirm" and is locked, because the
 *        screen shows a policy that has already been affirmed (that is how the product locks it today).
 *   Toggling a switch enables Save and shows "Unsaved Changes"; Cancel puts everything back; Save "saves".
 *
 * WHERE IT SITS
 *   Admin > Organization (`/organization` or `/organization/:id`), the Policies tab (`?tab=policies`), under the
 *   page header and tab bar, above the fixed Cancel / Save bar.
 *
 * MODELLED ON
 *   src/components/org/upsertOrgPage.tsx (page frame, back link, FSTabs bar) and
 *   src/components/org/orgPageV2/orgPolicies/ (orgPoliciesFeaturesTab, orgSharingFilterSection, orgPolicySectionV2,
 *   policyRow) for the sections, copy and the Acknowledgement select. The row layout is the settings row from
 *   orgPageV2/common/togglePreferenceRow.tsx. Chrome copied (not imported, they pull in plumbing):
 *   Breadcrumb from shared/pageTitle.tsx, TabTitle from shared/tabTitle.tsx, StickyFooterActions from
 *   common/stickyFooterActions.tsx.
 *
 * WHO THE NAVIGATION SHOWS
 *   A Flock admin (Organization List in the sub-nav and the "< Organization List" back link), exactly as the Figma
 *   draws it: top bar Search, Alerts, Map, VMS, Devices, Sharing, Insights, Admin, Planning Portal; sub-nav Account,
 *   Organization List, Organization (current), Devices, Roles, Users, Zones, Integrations, Alerts & Map, Billing,
 *   Contact Directory, Profile. This differs from .dsnr/knowledge/references/admin-shell-roles-2026-10-06.png (Patrol,
 *   FlockOS, Nova, Evidence, Transparency Portal and Alerts & FlockOS are not in the Figma); the Figma is what was
 *   asked for, so it wins here. It may not match what people see today.
 *
 * STATES  (?state=default)
 *   default             the screen as drawn in the Figma.
 *
 * MARKS
 *   @standin
 *     - The green organization banner behind the type and name. The real page draws plain text there.
 *     - Add on LPR Policy and Sharing MOU, and Download on Policy Report: the real ones open drawers and files; here
 *       they only say so in a snackbar.
 *     - Federal Sharing and Search Filters are drawn as two groups of rows under My Agency. The real page puts them
 *       under "General" and shows Sharing Policy / Search Filters as their own sections.
 *   @mock
 *     - Organization name and type, the policy names, descriptions and wording, who changed what and when.
 *     - The top-bar links and account menus (copied from the Figma, not from the signed-in account).
 *     - Descriptions the Figma leaves as "DESCRIPTION DESCRIPTION", and the two group labels it leaves as filler text.
 *   @remove
 *     - The placeholder shown when a tab other than Policies is clicked.
 *     - The simulated save delay and the snackbars that stand in for Add and Download.
 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@flocksafety/flock-react-component-lib/build/style.css';

import {
    FSAlert,
    FSApp,
    FSBox,
    FSButton,
    FSDivider,
    FSGrid,
    FSLink,
    FSLoadingButton,
    FSMenuItem,
    FSSelect,
    FSSnackbarProvider,
    FSStack,
    FSSymbol,
    FSTab,
    FSTabs,
    FSToggle,
    FSTypography,
    FSUniversalNav,
    useSnackbar,
} from '@flocksafety/flock-react-component-lib';
import type { OrgPoliciesFormModel } from 'src/data/models/orgFormModel';
import type { OrgSharingPolicyStatusV2 } from 'src/data/models/orgSharingPolicyStatusV2';
import type { PolicyStatus } from 'src/data/models/policyStatus';
import { type MouseEvent, type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------------------------------------------

// @mock: organization name and type. On move: comes from the organization.
const ORG_TYPE_LABEL = 'LAW ENFORCEMENT';
const ORG_NAME = 'Indianapolis Metro - PD';

// @mock: top-bar links come from the signed-in account (loggedInUser.nav), copied from the Figma.
// On move: delete; the account supplies them.
const EXTERNAL_APP_LINKS = ['Search', 'Alerts', 'Map', 'VMS', 'Devices', 'Sharing', 'Insights', 'Admin', 'Planning Portal'].map(
    (title) => ({ title, url: '#', isInternal: true }),
);

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

// @mock: sub-nav for a Flock admin, in the Figma's order. On move: computed by useAdminSubNavItems from permissions.
const SUB_NAV_ITEMS = [
    'Account',
    'Organization List',
    'Organization',
    'Devices',
    'Roles',
    'Users',
    'Zones',
    'Integrations',
    'Alerts & Map',
    'Billing',
    'Contact Directory',
    'Profile',
].map((title) => ({ title, value: `/${title}`, isBold: title === 'Organization' }));

type SavedPolicies = Required<Pick<OrgPoliciesFormModel, 'detailsForFederalSharingOptIn' | 'searchPolicies'>>;

// @mock: the organization's saved policies, shaped like OrgPoliciesFormModel. On move: the policies endpoint.
const SAVED_POLICIES: SavedPolicies = {
    detailsForFederalSharingOptIn: {
        enabled: true,
        updatedBy: 'Dana Whitfield',
        updatedAt: '2026-09-18T14:12:00Z',
    },
    searchPolicies: [
        {
            id: 'search-immigration',
            policyName: 'Immigration',
            description: 'Block searches that filter on immigration status.',
            enabled: true,
            enabledNetworkCount: 3,
            totalNetworkCount: 3,
            updatedBy: 'Marcus Okafor',
            updatedAt: '2026-10-02T15:41:00Z',
            type: 'network',
        },
        {
            id: 'search-reproductive-health',
            policyName: 'Reproductive Health',
            description: 'Block searches that filter on reproductive health care.',
            enabled: true,
            enabledNetworkCount: 3,
            totalNetworkCount: 3,
            updatedBy: 'Priya Delgado',
            updatedAt: '2026-10-02T15:43:00Z',
            type: 'network',
        },
    ],
};

// @mock: the Illinois state policy and who affirmed it. On move: the policies endpoint (sharingPolicies).
const ILLINOIS_POLICY: OrgSharingPolicyStatusV2 = {
    id: 'policy-illinois',
    entityId: 'state-il',
    entityType: 'locationEntity' as OrgSharingPolicyStatusV2['entityType'],
    policyName: 'Illinois State Policy',
    activePolicy: {
        documentId: 'doc-il-2025-07',
        policyAcceptanceText: '',
        policyRejectionText: '',
        effectiveAt: '2025-07-01T00:00:00Z',
        displayEffectiveAt: '2025-07-01T00:00:00Z',
        documentUpdatedAt: '2025-06-12T00:00:00Z',
        status: 'accepted' as PolicyStatus,
        accountName: 'Dana Whitfield',
        updatedAt: '2025-08-04T16:20:00Z',
    },
};

const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    const day = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    return `${day} at ${time}`;
};

// ---------------------------------------------------------------------------------------------------------------
// Chrome copied from the product (the real modules pull in Redux, auth and analytics)
// ---------------------------------------------------------------------------------------------------------------

// Copied from src/components/shared/pageTitle.tsx (Breadcrumb).
const Breadcrumb = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <FSGrid alignItems="start">
        <FSGrid>
            <FSLink onClick={onClick} sx={{ cursor: 'pointer' }} tabIndex={0} component="button" type="button">
                {'< ' + label}
            </FSLink>
        </FSGrid>
    </FSGrid>
);

// Copied from src/components/shared/tabTitle.tsx.
const TabTitle = ({ title, description }: { title: string; description: string }) => (
    <FSStack mb={2}>
        <FSTypography variant="h5" component="h2">
            {title}
        </FSTypography>
        <FSTypography variant="body2">{description}</FSTypography>
    </FSStack>
);

// Copied from src/components/common/stickyFooterActions.tsx.
const StickyFooterActions = ({ children }: { children: ReactNode | ReactNode[] }) => (
    <FSStack
        position="fixed"
        left="0"
        bottom="0"
        width="100vw"
        height="90px"
        sx={{ bgcolor: 'surface0.main', zIndex: '1001' }}
    >
        <FSDivider />
        <FSStack direction="row" justifyContent="space-between" alignItems="center" paddingX="32px" height="100%">
            {children}
        </FSStack>
    </FSStack>
);

// ---------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------

const visuallyHidden = {
    border: 0,
    clip: 'rect(0 0 0 0)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: '1px',
} as const;

// Same shape as orgPageV2/common/togglePreferenceRow.tsx, the title is also the toggle's accessible name.
const SettingsRow = ({
    title,
    description,
    meta,
    control,
}: {
    title: string;
    description: string;
    meta?: string;
    control?: ReactNode;
}) => (
    <FSStack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
        <FSStack>
            <FSTypography variant="subtitle1">{title}</FSTypography>
            <FSTypography variant="body2" color="text.secondary">
                {description}
            </FSTypography>
            {meta && (
                <FSTypography variant="caption" color="text.secondary">
                    {meta}
                </FSTypography>
            )}
        </FSStack>
        {control}
    </FSStack>
);

const PolicyToggle = ({
    name,
    e2eRef,
    checked,
    onChange,
}: {
    name: string;
    e2eRef: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) => (
    <FSToggle
        e2eRef={e2eRef}
        label={<span style={visuallyHidden}>{name}</span>}
        labelPlacement="start"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        sx={{ pr: 0, mr: -2 }}
    />
);

// ---------------------------------------------------------------------------------------------------------------
// The Policies tab
// ---------------------------------------------------------------------------------------------------------------

const PoliciesTab = () => {
    const snackbar = useSnackbar();
    const [saved, setSaved] = useState<SavedPolicies>(SAVED_POLICIES);
    const [form, setForm] = useState<SavedPolicies>(SAVED_POLICIES);
    const [saving, setSaving] = useState(false);

    const hasUnsavedChanges = useMemo(() => JSON.stringify(saved) !== JSON.stringify(form), [saved, form]);

    const setSearchEnabled = (id: string, enabled: boolean) =>
        setForm((prev) => ({
            ...prev,
            searchPolicies: prev.searchPolicies.map((p) => (p.id === id ? { ...p, enabled } : p)),
        }));

    const handleSave = () => {
        setSaving(true);
        // @remove: simulated save request. On move: updatePoliciesV2 and its success / error snackbars.
        window.setTimeout(() => {
            setSaved(form);
            setSaving(false);
            snackbar.success({ message: 'Successfully updated policy settings' });
        }, 700);
    };

    // @remove: stands in for the LPR Policy and Sharing MOU drawers and the Policy Report file download.
    const simulate = (what: string) => snackbar.info({ message: `${what} is not part of this prototype.` });

    const federal = form.detailsForFederalSharingOptIn;
    const illinoisDocument = ILLINOIS_POLICY.activePolicy;

    return (
        <FSBox
            component="form"
            data-e2e-ref="policies-tab"
            onSubmit={(e) => {
                e.preventDefault();
                handleSave();
            }}
            sx={{ padding: '1.5rem', marginBottom: '90px' }}
        >
            <TabTitle title="Policies" description="Define and manage organization compliance standards." />

            <FSBox component="section" aria-labelledby="my-agency-heading" data-e2e-ref="my-agency-section">
                <FSTypography variant="h6" component="h3" id="my-agency-heading" fontSize={16} sx={{ mb: 1 }}>
                    My Agency
                </FSTypography>
                <FSStack spacing={2}>
                    <SettingsRow
                        title="LPR Policy"
                        description="Link or upload your agency's license plate reader policy."
                        control={
                            <FSButton
                                e2eRef="lpr-policy-add-button"
                                variant="secondary"
                                startIcon={<FSSymbol name="add" aria-hidden="true" />}
                                onClick={() => simulate('Adding an LPR Policy')}
                                aria-label="Add LPR Policy"
                            >
                                Add
                            </FSButton>
                        }
                    />
                    <SettingsRow
                        title="Sharing MOU"
                        description="Upload the memorandum of understanding that covers how your agency shares data."
                        control={
                            <FSButton
                                e2eRef="sharing-mou-add-button"
                                variant="secondary"
                                startIcon={<FSSymbol name="add" aria-hidden="true" />}
                                onClick={() => simulate('Adding a Sharing MOU')}
                                aria-label="Add Sharing MOU"
                            >
                                Add
                            </FSButton>
                        }
                    />
                    <SettingsRow
                        title="Policy Report"
                        description="Download a report of your agency's policy acknowledgements."
                        control={
                            <FSButton
                                e2eRef="policy-report-download-button"
                                variant="secondary"
                                startIcon={<FSSymbol name="download" aria-hidden="true" />}
                                onClick={() => simulate('Downloading the Policy Report')}
                                aria-label="Download Policy Report"
                            >
                                Download
                            </FSButton>
                        }
                    />

                    <FSTypography variant="subtitle1" component="h4" sx={{ pt: 1 }}>
                        Federal Sharing
                    </FSTypography>
                    <SettingsRow
                        title="Receive Federal Share Requests"
                        description="Allow federal organizations to send your agency share requests."
                        control={
                            <PolicyToggle
                                name="Receive Federal Share Requests"
                                e2eRef="federal-sharing-toggle"
                                checked={federal.enabled}
                                onChange={(enabled) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        detailsForFederalSharingOptIn: { ...prev.detailsForFederalSharingOptIn, enabled },
                                    }))
                                }
                            />
                        }
                    />

                    <FSBox sx={{ pt: 1 }}>
                        <FSTypography variant="subtitle1" component="h4">
                            Search Filters
                        </FSTypography>
                        <FSTypography variant="body2" color="text.secondary">
                            Limit what your agency's searches can return, in line with your organization's policies.
                        </FSTypography>
                    </FSBox>
                    {form.searchPolicies.map((policy) => (
                        <SettingsRow
                            key={policy.id}
                            title={policy.policyName}
                            description={policy.description}
                            meta={
                                policy.type === 'network'
                                    ? `Last modified by ${policy.updatedBy} on ${formatDateTime(policy.updatedAt)}`
                                    : undefined
                            }
                            control={
                                <PolicyToggle
                                    name={policy.policyName}
                                    e2eRef={`${policy.policyName.toLowerCase().replace(/\s+/g, '-')}-toggle`}
                                    checked={policy.enabled}
                                    onChange={(enabled) => setSearchEnabled(policy.id, enabled)}
                                />
                            }
                        />
                    ))}
                </FSStack>
            </FSBox>

            <FSDivider sx={{ my: 3 }} />

            <FSBox component="section" aria-labelledby="state-heading" data-e2e-ref="state-policy-section">
                <FSTypography variant="h6" component="h3" id="state-heading" fontSize={16} sx={{ mb: 2 }}>
                    State
                </FSTypography>
                <FSTypography variant="subtitle1" component="h4" sx={{ mb: 2 }}>
                    {ILLINOIS_POLICY.policyName}
                </FSTypography>

                <FSStack spacing={2}>
                    <FSBox>
                        <FSTypography variant="body2" fontWeight={600}>
                            By AFFIRMING - We will never use Illinois' LPR data to investigate or enforce a law that:
                        </FSTypography>
                        <FSTypography variant="body2">
                            Interferes with a person obtaining reproductive health services or other health services, or
                            relates to a person's immigration status. See{' '}
                            <FSLink
                                href="#"
                                underline="always"
                                color="inherit"
                                onClick={(e: MouseEvent) => e.preventDefault()}
                            >
                                HB 3326
                            </FSLink>{' '}
                            for more information.
                        </FSTypography>
                    </FSBox>
                    <FSBox>
                        <FSTypography variant="body2" fontWeight={600}>
                            By DENYING - We do NOT affirm the above.
                        </FSTypography>
                        <FSTypography variant="body2">
                            By not affirming, our agency understands we will not be able to request access to Illinois
                            agencies' devices in the future, and will lose existing access to only Illinois' devices
                            through direct Sharing or via Flock's Lookup tool.
                        </FSTypography>
                    </FSBox>
                </FSStack>

                <FSStack direction="row" alignItems="center" spacing={3} sx={{ mt: 2 }}>
                    <FSBox sx={{ flexGrow: 1 }} data-e2e-ref="irreversible-notice">
                        <FSAlert severity="info">
                            <FSTypography fontSize={14} fontWeight={600}>
                                Once a selection is made, it cannot be undone. Please carefully review before saving.
                            </FSTypography>
                        </FSAlert>
                    </FSBox>
                    <FSBox sx={{ width: 260, flexShrink: 0 }} data-e2e-ref="acknowledgement-select">
                        <FSSelect
                            fullWidth
                            label="Acknowledgement"
                            value={illinoisDocument?.status === 'accepted' ? 'affirm' : ''}
                            onChange={() => undefined}
                            disabled
                        >
                            <FSMenuItem value="affirm">
                                <FSSymbol name="task_alt" aria-hidden="true" sx={{ mr: 1 }} />
                                Affirm
                            </FSMenuItem>
                            <FSMenuItem value="deny">
                                <FSSymbol name="block" aria-hidden="true" sx={{ mr: 1 }} />
                                Deny
                            </FSMenuItem>
                        </FSSelect>
                    </FSBox>
                </FSStack>
            </FSBox>

            <StickyFooterActions>
                <FSBox flexGrow={1} />
                {hasUnsavedChanges && (
                    <FSTypography
                        color="surfaceVariant.contrastText"
                        variant="subtitle2"
                        sx={{ display: 'flex', alignItems: 'center' }}
                        role="status"
                    >
                        <FSSymbol name="warning" aria-hidden="true" sx={{ mr: 1 }} />
                        Unsaved Changes
                    </FSTypography>
                )}
                <FSButton
                    e2eRef="cancel-button"
                    variant="secondary"
                    sx={{ ml: 3 }}
                    onClick={() => setForm(saved)}
                    type="button"
                >
                    Cancel
                </FSButton>
                <FSLoadingButton
                    data-e2e-ref="save-button"
                    sx={{ ml: 1 }}
                    type="submit"
                    disabled={!hasUnsavedChanges}
                    loading={saving}
                >
                    Save
                </FSLoadingButton>
            </StickyFooterActions>
        </FSBox>
    );
};

// ---------------------------------------------------------------------------------------------------------------
// Page: the whole app as a person sees it
// ---------------------------------------------------------------------------------------------------------------

type TabValue = 'overview' | 'planAndFeatures' | 'policies' | 'settings' | 'authentication';

// The Figma's tab bar: Plan & Features, not "Package & Features" as upsertOrgPage.tsx has it today.
const TABS: { value: TabValue; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'planAndFeatures', label: 'Plan & Features' },
    { value: 'policies', label: 'Policies' },
    { value: 'settings', label: 'Settings' },
    { value: 'authentication', label: 'Authentication' },
];

// The states, for the bar above the page to offer; the first is what the page opens in.
export const states = ['default'] as const;

const OrganizationPage = () => {
    const [tab, setTab] = useState<TabValue>('policies');
    const headerRef = useRef<HTMLDivElement>(null);
    const noop = useCallback(() => undefined, []);

    return (
        <FSSnackbarProvider anchorRef={headerRef}>
            <div ref={headerRef}>
                <FSUniversalNav
                    navbarTitle="Admin"
                    logoHref="#"
                    externalAppLinkItems={EXTERNAL_APP_LINKS}
                    helpLinkItem={HELP_ITEM}
                    userDetailsItem={USER_DETAILS_ITEM}
                    activeAppLinkItems={SUB_NAV_ITEMS}
                    activeAppNavigationHandler={noop}
                />
            </div>
            <FSGrid container direction="row" justifyContent="center" padding="1rem 1.5rem">
                <FSGrid width="100%" marginBottom="1rem">
                    <Breadcrumb onClick={noop} label="Organization List" />
                </FSGrid>
                <FSBox sx={{ width: '100%', maxWidth: '1200px' }}>
                    <FSStack direction="column" spacing={1} sx={{ marginTop: '1rem' }}>
                        {/* @standin: green organization banner. The real page draws the type and name as plain text. On move: decide whether the page header changes. */}
                        <FSBox
                            data-e2e-ref="org-header"
                            sx={{
                                bgcolor: 'primary.main',
                                color: 'primary.contrastText',
                                borderRadius: 2,
                                px: 4.5,
                                py: 3,
                                mb: 2,
                            }}
                        >
                            <FSTypography sx={{ fontSize: 14 }}>{ORG_TYPE_LABEL}</FSTypography>
                            <FSTypography variant="h3" component="h1">
                                {ORG_NAME}
                            </FSTypography>
                        </FSBox>
                        <FSBox sx={{ borderBottom: 1, borderColor: 'divider' }}>
                            <FSTabs
                                value={tab}
                                onChange={(_e, v) => setTab(v)}
                                sx={{ px: { xs: 0, sm: 2.5 }, '& .MuiTabs-flexContainer': { justifyContent: 'flex-start' } }}
                                variant="scrollable"
                                scrollButtons="auto"
                                allowScrollButtonsMobile
                            >
                                {TABS.map((t) => (
                                    <FSTab
                                        key={t.value}
                                        label={t.label}
                                        value={t.value}
                                        data-e2e-ref={t.value === 'policies' ? 'policies-tab-button' : undefined}
                                    />
                                ))}
                            </FSTabs>
                        </FSBox>
                        {tab === 'policies' ? (
                            <PoliciesTab />
                        ) : (
                            // @remove: the other tabs are not part of this prototype. On move: delete.
                            <FSBox sx={{ padding: 3 }}>
                                <FSAlert color="neutral">
                                    The {TABS.find((t) => t.value === tab)?.label} tab is unchanged and not shown in this
                                    prototype. Select Policies to continue.
                                </FSAlert>
                            </FSBox>
                        )}
                    </FSStack>
                </FSBox>
            </FSGrid>
        </FSSnackbarProvider>
    );
};

export default function Page() {
    return (
        <FSApp>
            <div className="app-container">
                <OrganizationPage />
            </div>
        </FSApp>
    );
}
