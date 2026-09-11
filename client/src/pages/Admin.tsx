import React, { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, App as AntApp, Popconfirm, Tag } from 'antd';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, errMsg } from '../api';
import type { UserInfo } from '../types';

const ROLE_LABELS: Record<string, string> = { admin: '管理员', editor: '编辑', viewer: '只读' };

export default function Admin() {
  const queryClient = useQueryClient();
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const { data } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.data.users as UserInfo[]) });
  const users = data || [];

  const createMutation = useMutation({
    mutationFn: (values: any) => api.post('/users', values),
    onSuccess: () => { message.success('用户已创建'); setOpen(false); form.resetFields(); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => message.error(errMsg(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => { message.success('已删除'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => message.error(errMsg(e)),
  });

  return (
    <Card
      title="用户管理"
      extra={<Button type="primary" onClick={() => setOpen(true)}>新增用户</Button>}
    >
      <Table<UserInfo>
        rowKey="id" dataSource={users} pagination={false}
        columns={[
          { title: '用户名', dataIndex: 'username' },
          { title: '姓名', dataIndex: 'display_name' },
          { title: '角色', dataIndex: 'role', render: (r: string) => <Tag color={r === 'admin' ? 'gold' : r === 'editor' ? 'blue' : 'default'}>{ROLE_LABELS[r]}</Tag> },
          { title: '创建时间', dataIndex: 'created_at' },
          {
            title: '操作', key: 'op',
            render: (_, u) => (
              <Popconfirm title="确认删除该用户？" onConfirm={() => deleteMutation.mutate(u.id)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal
        title="新增用户" open={open} onCancel={() => setOpen(false)}
        onOk={() => form.submit()} okText="创建" cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6 }]}><Input.Password /></Form.Item>
          <Form.Item name="display_name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]} initialValue="viewer">
            <Select options={[
              { value: 'admin', label: '管理员（全部权限）' },
              { value: 'editor', label: '编辑（可流转状态/评论）' },
              { value: 'viewer', label: '只读' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
