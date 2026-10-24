import KnowledgePage from '@/pages/Customer/Agents/Knowledge/KnowledgePage';
import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './PrivateRoute';
import PublicRoute from './PublicRoute';
import CustomerRoute from './CustomerRoute';
import SmartRedirect from './SmartRedirect';
import RouterGuard from '@/guards/RouterGuard';
import PermissionRoute from './PermissionRoute';
import { PluginRoutes, type PluginRoute as PluginRouteType } from '@/plugin-host';

import MainLayout from '@/components/layout/MainLayout';

// Mantém o layout da rota visível enquanto seu conteúdo é carregado sob demanda.
function withRouteSuspense<P extends object>(Page: React.ComponentType<P>) {
  return (props: P) => (
    <Suspense fallback={<div className="flex items-center justify-center h-full">Carregando...</div>}>
      <Page {...props} />
    </Suspense>
  );
}

// Páginas públicas
const Auth = withRouteSuspense(React.lazy(() => import('@/pages/Auth')));
const EmailConfirmation = withRouteSuspense(React.lazy(() => import('@/components/auth/EmailConfirmation')));
const ResetPassword = withRouteSuspense(React.lazy(() => import('@/components/auth/ResetPassword')));
const InstagramCallback = withRouteSuspense(React.lazy(() => import('@/pages/InstagramCallback')));
const GoogleCallback = withRouteSuspense(React.lazy(() => import('@/pages/GoogleCallback')));
const GoogleCalendarCallback = withRouteSuspense(React.lazy(() => import('@/pages/GoogleCalendarCallback')));
const GoogleSheetsCallback = withRouteSuspense(React.lazy(() => import('@/pages/GoogleSheetsCallback')));
const GitHubCallback = withRouteSuspense(React.lazy(() => import('@/pages/GitHubCallback')));
const NotionCallback = withRouteSuspense(React.lazy(() => import('@/pages/NotionCallback')));
const StripeCallback = withRouteSuspense(React.lazy(() => import('@/pages/StripeCallback')));
const LinearCallback = withRouteSuspense(React.lazy(() => import('@/pages/LinearCallback')));
const MondayCallback = withRouteSuspense(React.lazy(() => import('@/pages/MondayCallback')));
const AtlassianCallback = withRouteSuspense(React.lazy(() => import('@/pages/AtlassianCallback')));
const MicrosoftCallback = withRouteSuspense(React.lazy(() => import('@/pages/MicrosoftCallback')));
const SurveyResponse = withRouteSuspense(React.lazy(() => import('@/pages/Public/Survey/SurveyResponse')));
const PublicChatPage = withRouteSuspense(React.lazy(() => import('@/pages/Public/Chat/ChatPage')));
const FormPage = withRouteSuspense(React.lazy(() => import('@/pages/Public/Form/FormPage')));

// Páginas customer
const Dashboard = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Dashboard')));
const Agents = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Agents')));
const AgentsIndexRedirect = withRouteSuspense(React.lazy(() => import('@/components/agents/AgentsIndexRedirect')));
const AgentEditPage = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Agents/Agent/AgentEditPage')));
const MCPServers = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Agents/MCPServers')));
const CustomMCPServers = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Agents/CustomMCPServers')));
const Tools = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Agents/Tools')));
const CustomTools = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Agents/CustomTools')));
const Contacts = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Contacts')));
const ScheduledActions = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Contacts/ScheduledActions')));
const Channels = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Channels').then(module => ({ default: module.Channels }))));
const ChannelSettings = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Channels').then(module => ({ default: module.ChannelSettings }))));
const NewChannel = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Channels').then(module => ({ default: module.NewChannel }))));
const ChatPage = React.lazy(() => import('@/pages/Customer/Chat/ChatPage'));

const Automation = withRouteSuspense(React.lazy(() => import('../pages/Customer/Automation')));
const AutomationForm = withRouteSuspense(React.lazy(() => import('../pages/Customer/Automation/AutomationForm')));
// import AutomationFlowEditor from '../pages/Customer/Automation/AutomationFlowEditor';
const Pipelines = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Pipelines/Pipelines')));
const PipelineKanban = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Pipelines/PipelineKanban')));
const PipelineFormPage = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Pipelines/PipelineFormPage')));
const AccountSettings = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Account').then(module => ({ default: module.AccountSettings }))));
const Teams = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Teams/Teams')));
const AddUsers = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Teams').then(module => ({ default: module.AddUsers }))));
const Users = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Users')));
const Labels = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Labels')));
const CustomAttributes = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/CustomAttributes')));
const Segments = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Segments/Segments')));
const SegmentCreateEdit = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Segments/SegmentCreateEdit')));
const Journey = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Journey/Journey')));
const JourneyFlowEditor = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Journey/JourneyFlowEditor')));
const Campaigns = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Campaigns/Campaigns')));
const NewCampaign = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Campaigns/NewCampaign/NewCampaign')));
const CannedResponses = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/CannedResponses')));
const AiCredentials = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/AiCredentials')));
const IntegrationCredentials = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/IntegrationCredentials')));
const MessageTemplates = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/MessageTemplates')));
const Macros = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Macros').then(module => ({ default: module.Macros }))));
const Products = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Products')));
const ProductsImport = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Products').then(module => ({ default: module.ProductsImport }))));
const CrmForms = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/CrmForms')));
const ChatPages = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/ChatPages')));
const Templates = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Templates/Templates')));
const Integrations = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/Integrations').then(module => ({ default: module.Integrations }))));
const EmailTemplateEditor = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Settings/EmailTemplateEditor')));
const WebhooksPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/WebhooksPage')));
const OAuthAppsPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/OAuthAppsPage')));
const DashboardAppsPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/DashboardAppsPage')));
const AccessTokens = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/AccessTokens/AccessTokens')));
const SlackIntegrationPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/SlackIntegrationPage')));
const OpenAIPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/OpenAIPage')));
const BMSPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/BMSPage')));
const LeadSquaredPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/LeadSquaredPage')));
const HubSpotPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/HubSpotPage')));
const ShopifyPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/ShopifyPage')));
const LinearPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/Settings/Integrations/LinearPage')));
const DashboardAppPage = withRouteSuspense(React.lazy(() => import('../pages/Customer/DashboardApp')));

// Páginas admin
const AdminSettingsLayout = withRouteSuspense(React.lazy(() => import('@/pages/Admin/Settings')));
const RolesList = React.lazy(() => import('@/pages/Admin/Roles/RolesList'));
const RoleDetail = React.lazy(() => import('@/pages/Admin/Roles/RoleDetail'));
const SmtpConfig = React.lazy(() => import('@/pages/Admin/Settings/SmtpConfig'));
const StorageConfig = React.lazy(() => import('@/pages/Admin/Settings/StorageConfig'));
const ChannelConfig = React.lazy(() => import('@/pages/Admin/Settings/ChannelConfig'));
const OpenAIConfig = React.lazy(() => import('@/pages/Admin/Settings/OpenAIConfig'));
const IntegrationsConfig = React.lazy(() => import('@/pages/Admin/Settings/IntegrationsConfig'));
const EvolutionHubConfig = React.lazy(() => import('@/pages/Admin/Settings/EvolutionHubConfig'));

// Página de tutoriais
const Tutorials = withRouteSuspense(React.lazy(() => import('@/pages/Customer/Tutorials')));

// Páginas compartilhadas
const Documentation = withRouteSuspense(React.lazy(() => import('@/pages/Shared/Documentation')));
const Marketplace = withRouteSuspense(React.lazy(() => import('@/pages/Shared/Marketplace')));
const Profile = withRouteSuspense(React.lazy(() => import('@/pages/Shared/Profile')));

// Página de setup inicial
const Setup = withRouteSuspense(React.lazy(() => import('@/pages/Setup/Setup')));
const OnboardingPage = withRouteSuspense(React.lazy(() => import('@/pages/Setup/OnboardingPage')));

// Outras páginas
const NotFound = withRouteSuspense(React.lazy(() => import('@/pages/NotFound')));
const Unauthorized = withRouteSuspense(React.lazy(() => import('@/pages/Unauthorized')));
const Widget = withRouteSuspense(React.lazy(() => import('@/pages/Widget')));
const AsanaCallback = withRouteSuspense(React.lazy(() => import('@/pages/AsanaCallback')));
const HubSpotCallback = withRouteSuspense(React.lazy(() => import('@/pages/HubSpotCallback')));
const PayPalCallback = withRouteSuspense(React.lazy(() => import('@/pages/PayPalCallback')));
const CanvaCallback = withRouteSuspense(React.lazy(() => import('@/pages/CanvaCallback')));
const SupabaseCallback = withRouteSuspense(React.lazy(() => import('@/pages/SupabaseCallback')));
// import ChangePassword from '../pages/ChangePassword';

const ChatRouteElement = (
  <PrivateRoute>
    <CustomerRoute>
      <MainLayout>
        <PermissionRoute resource="conversations" action="read">
          <Suspense
            fallback={<div className="flex items-center justify-center h-full">Carregando...</div>}
          >
            <ChatPage />
          </Suspense>
        </PermissionRoute>
      </MainLayout>
    </CustomerRoute>
  </PrivateRoute>
);

const AppRouter = () => {
  return (
    <BrowserRouter>
      <RouterGuard>
        <Routes>
          {/* Redirecionamento inteligente da raiz baseado no tipo de usuário */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <SmartRedirect />
              </PrivateRoute>
            }
          />

          {/* Rotas públicas */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Auth />
              </PublicRoute>
            }
          />

          <Route
            path="/auth/confirm-email"
            element={
              <PublicRoute>
                <EmailConfirmation />
              </PublicRoute>
            }
          />

          <Route
            path="/auth/confirmation"
            element={
              <PublicRoute>
                <EmailConfirmation />
              </PublicRoute>
            }
          />

          <Route
            path="/auth/reset-password"
            element={
              <PublicRoute>
                <ResetPassword />
              </PublicRoute>
            }
          />

          <Route
            path="/auth/password/edit"
            element={
              <PublicRoute>
                <ResetPassword />
              </PublicRoute>
            }
          />

          {/* Instagram OAuth Callback */}
          <Route
            path="/instagram/callback"
            element={
              <PublicRoute>
                <InstagramCallback />
              </PublicRoute>
            }
          />

          {/* Google OAuth Callback */}
          <Route
            path="/google/callback"
            element={
              <PublicRoute>
                <GoogleCallback />
              </PublicRoute>
            }
          />

          {/* Google Calendar OAuth Callback */}
          <Route
            path="/google-calendar/callback"
            element={
              <PublicRoute>
                <GoogleCalendarCallback />
              </PublicRoute>
            }
          />

          {/* Google Sheets OAuth Callback */}
          <Route
            path="/google-sheets/callback"
            element={
              <PublicRoute>
                <GoogleSheetsCallback />
              </PublicRoute>
            }
          />

          {/* GitHub OAuth Callback */}
          <Route
            path="/github/callback"
            element={
              <PublicRoute>
                <GitHubCallback />
              </PublicRoute>
            }
          />

          {/* Notion OAuth Callback */}
          <Route
            path="/notion/callback"
            element={
              <PublicRoute>
                <NotionCallback />
              </PublicRoute>
            }
          />

          {/* Stripe OAuth Callback */}
          <Route
            path="/stripe/callback"
            element={
              <PublicRoute>
                <StripeCallback />
              </PublicRoute>
            }
          />

          {/* Linear OAuth Callback */}
          <Route
            path="/linear/callback"
            element={
              <PublicRoute>
                <LinearCallback />
              </PublicRoute>
            }
          />

          {/* Monday OAuth Callback */}
          <Route
            path="/monday/callback"
            element={
              <PublicRoute>
                <MondayCallback />
              </PublicRoute>
            }
          />

          {/* Atlassian OAuth Callback */}
          <Route
            path="/atlassian/callback"
            element={
              <PublicRoute>
                <AtlassianCallback />
              </PublicRoute>
            }
          />

          {/* Asana OAuth Callback */}
          <Route
            path="/asana/callback"
            element={
              <PublicRoute>
                <AsanaCallback />
              </PublicRoute>
            }
          />

          {/* HubSpot OAuth Callback */}
          <Route
            path="/hubspot/callback"
            element={
              <PublicRoute>
                <HubSpotCallback />
              </PublicRoute>
            }
          />

          {/* PayPal OAuth Callback */}
          <Route
            path="/paypal/callback"
            element={
              <PublicRoute>
                <PayPalCallback />
              </PublicRoute>
            }
          />

          {/* Canva OAuth Callback */}
          <Route
            path="/canva/callback"
            element={
              <PublicRoute>
                <CanvaCallback />
              </PublicRoute>
            }
          />

          {/* Supabase OAuth Callback */}
          <Route
            path="/supabase/callback"
            element={
              <PublicRoute>
                <SupabaseCallback />
              </PublicRoute>
            }
          />

          {/* Microsoft OAuth Callback */}
          <Route
            path="/microsoft/callback"
            element={
              <PublicRoute>
                <MicrosoftCallback />
              </PublicRoute>
            }
          />

          {/* <Route path="/change-password" element={<ChangePassword />} /> */}

          {/* Public widget route (for website embeds) */}
          <Route
            path="/widget"
            element={
              <PublicRoute>
                <Widget />
              </PublicRoute>
            }
          />

          {/* Public survey response route (CSAT surveys) */}
          <Route
            path="/survey/responses/:uuid"
            element={
              <PublicRoute>
                <SurveyResponse />
              </PublicRoute>
            }
          />

          {/* Public lead-capture form route (B14.02) */}
          <Route
            path="/f/:slug"
            element={
              <PublicRoute>
                <FormPage />
              </PublicRoute>
            }
          />

          {/* Public chat page route (B14.03) */}
          <Route
            path="/chat/:slug"
            element={
              <PublicRoute>
                <PublicChatPage />
              </PublicRoute>
            }
          />

          {/* Rota de Setup Inicial */}
          <Route path="/setup" element={<Setup />} />
          <Route path="/setup/onboarding" element={<OnboardingPage />} />

          <Route
            path="/contacts"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="contacts" action="read">
                      <Contacts />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/contacts/:contactId"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="contacts" action="read">
                      <Contacts />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/contacts/scheduled-actions"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="contacts" action="read">
                      <ScheduledActions />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/pipelines"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="pipelines" action="read">
                      <Pipelines />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/pipelines/new"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="pipelines" action="create">
                      <PipelineFormPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/pipelines/:pipelineId"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="pipelines" action="read">
                      <PipelineKanban />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/automation"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="automation_rules" action="read">
                      <Automation />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/automation/new"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="automation_rules" action="create">
                      <AutomationForm mode="create" />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/automation/:id/edit"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="automation_rules" action="update">
                      <AutomationForm mode="edit" />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          {/* <Route
            path="/automation/:id/flow"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <PermissionRoute resource="automation_rules" action="update">
                    <AutomationFlowEditor />
                  </PermissionRoute>
                </CustomerRoute>
              </PrivateRoute>
            }
          /> */}

          {/* Segments (settings subroute) */}
          <Route
            path="/settings/segments"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="segments" action="read">
                      <Segments />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/segments/new"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="segments" action="create">
                      <SegmentCreateEdit />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/segments/:id/edit"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="segments" action="update">
                      <SegmentCreateEdit />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          {/* Journeys */}
          <Route
            path="/journeys"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="journeys" action="read">
                      <Journey />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/journey/:id/flow"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="journeys" action="update">
                      <JourneyFlowEditor />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          {/* Campaigns */}
          <Route
            path="/campaigns"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="campaigns" action="read">
                      <Campaigns />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/campaigns/new"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="campaigns" action="create">
                      <NewCampaign />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/campaigns/:id/edit"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="campaigns" action="update">
                      <NewCampaign />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/account"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="accounts" action="read">
                      <AccountSettings />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/users"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    {/* EVO-1938: users.manage (admin) — agents hold users.read but not manage */}
                    <PermissionRoute resource="users" action="manage">
                      <Users />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/teams"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="teams" action="manage">
                      <Teams />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/teams/:teamId/add-users"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="teams" action="manage">
                      <AddUsers />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/labels"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="labels" action="read">
                      <Labels />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/attributes"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute
                      permissions={[
                        'custom_attribute_definitions.create',
                        'custom_attribute_definitions.update',
                        'custom_attribute_definitions.delete',
                      ]}
                    >
                      <CustomAttributes />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/canned-responses"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="canned_responses" action="read">
                      <CannedResponses />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/ai-credentials"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_api_keys" action="read">
                      <AiCredentials />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/integration-credentials"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_integration_credentials" action="read">
                      <IntegrationCredentials />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/message-templates"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="message_templates" action="manage">
                      <MessageTemplates />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/products"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="products" action="read">
                      <Products />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/crm-forms"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="crm_forms" action="read">
                      <CrmForms />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/chat-pages"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="chat_pages" action="read">
                      <ChatPages />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/products/import"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="products" action="create">
                      <ProductsImport />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/macros"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="macros" action="manage">
                      <Macros />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/templates"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="templates" action="read">
                      <Templates />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/integrations"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <Integrations />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          {/* Redirecionamentos das rotas antigas de settings para agents */}
          <Route
            path="/settings/custom-tools"
            element={<Navigate to="/agents/custom-tools" replace />}
          />

          <Route
            path="/settings/custom-mcp-servers"
            element={<Navigate to="/agents/custom-mcp-servers" replace />}
          />

          <Route
            path="/settings/integrations/webhooks"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="webhooks" action="read">
                      <WebhooksPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/integrations/oauth-apps"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="oauth_applications" action="read">
                      <OAuthAppsPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/integrations/dashboard-apps"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="dashboard_apps" action="read">
                      <DashboardAppsPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/integrations/slack"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <SlackIntegrationPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/integrations/openai"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <OpenAIPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/integrations/bms"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <BMSPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/integrations/leadsquared"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <LeadSquaredPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/integrations/hubspot"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <HubSpotPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/integrations/shopify"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <ShopifyPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/integrations/linear"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <LinearPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          {/* Dynamic Dashboard Apps Routes */}
          <Route
            path="/dashboard-app/:appId"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="dashboard_apps" action="read">
                      <DashboardAppPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/access-tokens"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="access_tokens" action="read">
                      <AccessTokens />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/integrations/:integrationId"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="integrations" action="read">
                      <div className="p-6">
                        <div className="h-full flex items-center justify-center">
                          <div className="text-center">
                            <h2 className="text-2xl font-bold mb-2">🔧 Configuração</h2>
                            <p className="text-muted-foreground">
                              Página de configuração em desenvolvimento
                            </p>
                          </div>
                        </div>
                      </div>
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/channels"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="inboxes" action="read">
                      <Channels />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/channels/new"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="inboxes" action="create">
                      <NewChannel />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/channels/:id/settings"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="inboxes" action="update">
                      <ChannelSettings />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/settings/email-template-editor"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="message_templates" action="manage">
                      <EmailTemplateEditor />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route path="/agents" element={<AgentsIndexRedirect />} />

          {/* Lista de agentes */}
          <Route
            path="/agents/list"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_agents" action="read">
                      <Agents />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/new"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_agents" action="create">
                      <Agents />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/:id/edit"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_agents" action="update">
                      <AgentEditPage />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/management"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_agents" action="read">
                      <Agents />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/mcp-servers"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_mcp_servers" action="read">
                      <MCPServers />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route path="/agents/knowledge" element={<PrivateRoute><CustomerRoute><MainLayout><PermissionRoute resource="ai_knowledge" action="read"><KnowledgePage /></PermissionRoute></MainLayout></CustomerRoute></PrivateRoute>} />

          <Route
            path="/agents/custom-mcp-servers"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_custom_mcp_servers" action="read">
                      <CustomMCPServers />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/custom-mcp-servers/new"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_custom_mcp_servers" action="create">
                      <CustomMCPServers />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/custom-mcp-servers/:id/edit"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_custom_mcp_servers" action="update">
                      <CustomMCPServers />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/tools"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_tools" action="read">
                      <Tools />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/custom-tools"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_custom_tools" action="read">
                      <CustomTools />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/custom-tools/new"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_custom_tools" action="create">
                      <CustomTools />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/agents/custom-tools/:id/edit"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="ai_custom_tools" action="update">
                      <CustomTools />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    {/* No PermissionRoute: `dashboard.read` is a basic auth read,
                        not a catalog resource, so `can('dashboard','read')` denies
                        for everyone. Dashboard is the landing page — always visible
                        to authenticated users (EVO-2071 AC7). */}
                    <Dashboard />
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          <Route path="/conversations" element={ChatRouteElement} />

          <Route path="/conversations/:conversationId" element={ChatRouteElement} />

          {/* Tutoriais */}
          <Route
            path="/tutorials"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <Tutorials />
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          {/* Rotas específicas de canais foram integradas no fluxo unificado do NewChannel */}
          {/* Meta e WhatsApp Cloud agora são parte do componente NewChannel */}

          {/* Roles & Permissions Routes */}
          <Route
            path="/settings/roles"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="roles" action="read">
                      <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                        <RolesList />
                      </Suspense>
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/roles/:id"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="roles" action="read">
                      <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                        <RoleDetail />
                      </Suspense>
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          />

          {/* Admin Settings Routes */}
          <Route
            path="/settings/admin"
            element={
              <PrivateRoute>
                <CustomerRoute>
                  <MainLayout>
                    <PermissionRoute resource="installation_configs" action="manage">
                      <AdminSettingsLayout />
                    </PermissionRoute>
                  </MainLayout>
                </CustomerRoute>
              </PrivateRoute>
            }
          >
            <Route
              path="email"
              element={
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                  <SmtpConfig />
                </Suspense>
              }
            />
            <Route
              path="storage"
              element={
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                  <StorageConfig />
                </Suspense>
              }
            />
            <Route
              path="channels"
              element={
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                  <ChannelConfig />
                </Suspense>
              }
            />
            <Route
              path="openai"
              element={
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                  <OpenAIConfig />
                </Suspense>
              }
            />
            <Route
              path="integrations"
              element={
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                  <IntegrationsConfig />
                </Suspense>
              }
            />
            <Route
              path="evolution-hub"
              element={
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                  <EvolutionHubConfig />
                </Suspense>
              }
            />
          </Route>

          {/* Rotas Compartilhadas */}
          <Route
            path="/documentation"
            element={
              <PrivateRoute>
                <MainLayout>
                  <Documentation />
                </MainLayout>
              </PrivateRoute>
            }
          />

          <Route
            path="/marketplace"
            element={
              <PrivateRoute>
                <MainLayout>
                  <Marketplace />
                </MainLayout>
              </PrivateRoute>
            }
          />

          <Route
            path="/profile/:section?"
            element={
              <PrivateRoute>
                <MainLayout>
                  <Profile />
                </MainLayout>
              </PrivateRoute>
            }
          />

          {/* Rota 403 - Sem permissão */}
          <Route
            path="/unauthorized"
            element={
              <PrivateRoute>
                <Unauthorized />
              </PrivateRoute>
            }
          />

          {PluginRoutes({
            namespace: 'admin',
            wrap: (element, route: PluginRouteType) => (
              <PrivateRoute>
                {route.layout === 'none' ? element : <MainLayout>{element}</MainLayout>}
              </PrivateRoute>
            ),
          })}

          {PluginRoutes({
            namespace: 'customer',
            wrap: (element, route: PluginRouteType) => (
              <PrivateRoute>
                <CustomerRoute>
                  {route.layout === 'none' ? element : <MainLayout>{element}</MainLayout>}
                </CustomerRoute>
              </PrivateRoute>
            ),
          })}

          {PluginRoutes({ namespace: 'public' })}

          {/* Rota 404 - Página não encontrada */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </RouterGuard>
    </BrowserRouter>
  );
};

export default AppRouter;
