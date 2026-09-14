import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout, Menu, Dropdown, Avatar, Space, theme } from 'antd';
import {
  DashboardOutlined, UnorderedListOutlined, AppstoreOutlined,
  VerticalRightOutlined, UsergroupAddOutlined, LogoutOutlined, UserOutlined,
} from '@ant-design/icons';
import { LinkageProvider } from './store';
import { ROLE_LABELS } from './types';
import type { UserInfo } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ModuleList from './pages/ModuleList';
import Kanban from './pages/Kanban';
import Timeline from './pages/Timeline';
import Admin from './pages/Admin';
import ModuleDetail from './components/ModuleDetail';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function currentUser(): UserInfo | null {
  try {
    return JSON.parse(localStorage.getItem('adas_user') || 'null');
  } catch {
    return null;
  }
}

function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = currentUser();
  const { token: { colorBgContainer } } = theme.useToken();

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '总览看板' },
    { key: '/list', icon: <UnorderedListOutlined />, label: '需求列表' },
    { key: '/kanban', icon: <AppstoreOutlined />, label: '状态看板' },
    { key: '/timeline', icon: <VerticalRightOutlined />, label: '打标时间线' },
    ...(user?.role === 'admin' ? [{ key: '/admin', icon: <UsergroupAddOutlined />, label: '用户管理' }] : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {collapsed ? 'AR' : 'ADAS 需求管理平台'}
        </div>
        <Menu
          theme="dark" mode="inline" selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: colorBgContainer, padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }],
              onClick: ({ key }) => {
                if (key === 'logout') {
                  localStorage.removeItem('adas_token');
                  localStorage.removeItem('adas_user');
                  navigate('/login');
                }
              },
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{user?.display_name}（{user ? ROLE_LABELS[user.role] || user.role : ''}）</span>
            </Space>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ margin: 16 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/list" element={<ModuleList />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
      {/* 三版联动：全局模块详情抽屉，任何视图选中即打开 */}
      <ModuleDetail />
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LinkageProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<RequireAuth><Shell /></RequireAuth>} />
          </Routes>
        </HashRouter>
      </LinkageProvider>
    </QueryClientProvider>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!localStorage.getItem('adas_token')) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
