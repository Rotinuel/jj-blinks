import { requirePermission } from '@/lib/auth';
import { query } from '@/lib/db';
import { ROLE_LABELS, ROLES, PERMISSIONS } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utilities';
import { addStaffAction, changeRoleAction, staffActiveAction } from '@/app/actions/admin/store';
import SubmitButton from '@/components/admin/SubmitButton';
import PasswordInput from '@/components/ui/PasswordInput';
import { Field, Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Staff & roles' };

export default async function TeamAdmin({ searchParams }) {
  const user = await requirePermission('staff.manage');
  const sp = await searchParams;
  const staff = await query(`SELECT id, name, email, role, is_active, last_login_at FROM users WHERE role <> 'customer' ORDER BY role, name`);
  return (
    <>
      <PageHead title="Staff & roles" />
      <Flash sp={sp} />
      <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Status</th></tr></thead>
        <tbody>{staff.map((s) => (
          <tr key={s.id}>
            <td>{s.name}{Number(s.id) === Number(user.id) && <span className="tag ml-2">You</span>}</td><td>{s.email}</td>
            <td>
              <form action={changeRoleAction} className="flex gap-2"><input type="hidden" name="id" value={s.id} />
                <select name="role" defaultValue={s.role} className="input w-44" aria-label={`Role for ${s.name}`}>{ROLES.map((r) => <option key={r} value={r}>{r === 'customer' ? 'Remove staff access' : ROLE_LABELS[r]}</option>)}</select>
                <SubmitButton className="btn btn-outline btn-sm">Save</SubmitButton>
              </form>
            </td>
            <td>{s.last_login_at ? formatDateTime(s.last_login_at) : 'Never'}</td>
            <td>{Number(s.id) !== Number(user.id) && (
              <form action={staffActiveAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={String(!s.is_active)} />
                <SubmitButton className="link text-sm">{s.is_active ? 'Deactivate' : 'Reactivate'}</SubmitButton></form>
            )}{!s.is_active && <span className="text-danger"> Deactivated</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>

      <section className="mt-12 max-w-3xl"><h2 className="mb-4 font-display text-2xl">Add a staff member</h2>
        <form action={addStaffAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" required />
          <Field label="Email" name="email" type="email" required />
          <Field label="Role" name="role"><select id="role" name="role" className="input">{ROLES.filter((r) => r !== 'customer').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
          <Field label="Temporary password" name="password" hint="Not needed if they already have a customer account. Share it securely."><PasswordInput id="password" name="password" autoComplete="new-password" /></Field>
          <SubmitButton className="btn btn-primary justify-self-start">Add staff member</SubmitButton>
        </form>
      </section>

      <section className="mt-12"><h2 className="mb-4 font-display text-2xl">What each role can do</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 text-sm">
          {ROLES.filter((r) => r !== 'customer').map((r) => (
            <div key={r}><p className="font-medium">{ROLE_LABELS[r]}</p><ul className="mt-2 text-muted">{PERMISSIONS[r].map((p) => <li key={p}>{p}</li>)}</ul></div>
          ))}
        </div>
      </section>
    </>
  );
}
