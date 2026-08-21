/**
 * Double en mémoire du client Prisma, pour tester les services sans base.
 *
 * Point clé : les sémantiques de `updateMany` sont respectées à la lettre.
 * `PaymentsService.completePayment()` s'appuie sur
 *   `updateMany({ where: { id, status: { in: ['PENDING','PROCESSING'] } } })`
 * et considère `count === 1` comme « j'ai remporté la transition ». Un double
 * qui renverrait toujours `count: 1` ferait passer les tests d'idempotence et
 * de concurrence **à tort**. Ici le store est réellement mutable et un second
 * appel sur une ligne déjà COMPLETED renvoie bien `count: 0`.
 *
 * Deuxième garde-fou : tout opérateur de filtre non implémenté lève une erreur
 * explicite plutôt que d'être ignoré silencieusement (un `where` mal interprété
 * produirait des faux positifs).
 */

type Row = Record<string, any>;

let idCounter = 0;
let seqCounter = 0;
const nextId = (prefix: string) => `${prefix}-${String(++idCounter).padStart(4, '0')}`;

// ==================== moteur de filtrage ====================

const isDate = (v: unknown): v is Date => v instanceof Date;

function eq(a: any, b: any): boolean {
  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime();
  if (a === null || a === undefined) return b === null || b === undefined;
  return a === b;
}

function cmp(a: any, b: any): number {
  const x = isDate(a) ? a.getTime() : a;
  const y = isDate(b) ? b.getTime() : b;
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

/** Évalue une condition Prisma sur une valeur de colonne. */
function matchCond(value: any, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond === null) return value === null || value === undefined;
  if (isDate(cond) || typeof cond !== 'object' || Array.isArray(cond)) return eq(value, cond);

  for (const [op, operand] of Object.entries(cond)) {
    switch (op) {
      case 'equals':
        if (!eq(value, operand)) return false;
        break;
      case 'not':
        if (eq(value, operand)) return false;
        break;
      case 'in':
        if (!(operand as any[]).some((o) => eq(value, o))) return false;
        break;
      case 'notIn':
        if ((operand as any[]).some((o) => eq(value, o))) return false;
        break;
      case 'lt':
        if (value == null || cmp(value, operand) >= 0) return false;
        break;
      case 'lte':
        if (value == null || cmp(value, operand) > 0) return false;
        break;
      case 'gt':
        if (value == null || cmp(value, operand) <= 0) return false;
        break;
      case 'gte':
        if (value == null || cmp(value, operand) < 0) return false;
        break;
      default:
        throw new Error(
          `fakePrisma: opérateur de filtre non supporté « ${op} ». ` +
            `Implémentez-le dans matchCond() plutôt que de le laisser passer.`,
        );
    }
  }
  return true;
}

function matchWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [field, cond] of Object.entries(where)) {
    if (field === 'AND') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((w: Row) => matchWhere(row, w))) return false;
    } else if (field === 'OR') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.some((w: Row) => matchWhere(row, w))) return false;
    } else if (field === 'NOT') {
      if (matchWhere(row, cond as Row)) return false;
    } else if (!matchCond(row[field], cond)) {
      return false;
    }
  }
  return true;
}

// ==================== table ====================

interface TableOptions {
  /** Valeurs par défaut appliquées à la création (colonnes Prisma `@default`). */
  defaults: () => Row;
  /** Préfixe des identifiants générés. */
  prefix: string;
  /** Relations résolvables via `include`. */
  relations?: Record<string, { table: () => Table; localField: string; foreignField: string }>;
}

class Table {
  rows: Row[] = [];

  constructor(
    private readonly name: string,
    private readonly options: TableOptions,
  ) {}

  clear() {
    this.rows = [];
  }

  /** Insertion directe utilisée par les helpers de seed (sans passer par l'API). */
  insert(data: Row): Row {
    const row = { ...this.options.defaults(), ...data, __seq: ++seqCounter };
    if (row.id === undefined || row.id === null) row.id = nextId(this.options.prefix);
    this.rows.push(row);
    return this.clone(row);
  }

  private clone(row: Row): Row {
    const { __seq, ...rest } = row;
    return { ...rest };
  }

  private project(row: Row, select?: Row, include?: Row): Row {
    let out: Row;
    if (select) {
      out = {};
      for (const [field, wanted] of Object.entries(select)) {
        if (wanted) out[field] = row[field];
      }
    } else {
      out = this.clone(row);
    }
    for (const [relName, relOpts] of Object.entries(include || {})) {
      const rel = this.options.relations?.[relName];
      if (!rel) throw new Error(`fakePrisma: relation « ${relName} » inconnue sur ${this.name}`);
      const target = rel.table();
      const linked = target.rows.find((r) => eq(r[rel.foreignField], row[rel.localField]));
      const relSelect = typeof relOpts === 'object' ? (relOpts as Row).select : undefined;
      out[relName] = linked ? target.project(linked, relSelect) : null;
    }
    return out;
  }

  private sort(rows: Row[], orderBy?: Row): Row[] {
    if (!orderBy) return rows;
    const [[field, dir]] = Object.entries(orderBy);
    const factor = dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const c = cmp(a[field], b[field]);
      // __seq départage les valeurs identiques (lignes créées dans la même ms).
      return (c !== 0 ? c : cmp(a.__seq, b.__seq)) * factor;
    });
  }

  // ---------- API Prisma ----------

  async findUnique(args: { where: Row; select?: Row; include?: Row }) {
    const row = this.rows.find((r) => matchWhere(r, args.where));
    return row ? this.project(row, args.select, args.include) : null;
  }

  async findFirst(args: { where?: Row; select?: Row; include?: Row; orderBy?: Row }) {
    const found = this.sort(
      this.rows.filter((r) => matchWhere(r, args.where)),
      args.orderBy,
    )[0];
    return found ? this.project(found, args.select, args.include) : null;
  }

  async findMany(args: { where?: Row; select?: Row; include?: Row; orderBy?: Row } = {}) {
    const found = this.rows.filter((r) => matchWhere(r, args.where));
    return this.sort(found, args.orderBy).map((r) => this.project(r, args.select, args.include));
  }

  async create(args: { data: Row; select?: Row; include?: Row }) {
    const row = { ...this.options.defaults(), ...args.data, __seq: ++seqCounter };
    if (row.id === undefined || row.id === null) row.id = nextId(this.options.prefix);
    this.rows.push(row);
    return this.project(row, args.select, args.include);
  }

  async createMany(args: { data: Row[] }) {
    for (const d of args.data) await this.create({ data: d });
    return { count: args.data.length };
  }

  async update(args: { where: Row; data: Row; select?: Row; include?: Row }) {
    const row = this.rows.find((r) => matchWhere(r, args.where));
    if (!row) {
      const err: any = new Error(`fakePrisma: ${this.name}.update — aucune ligne ne correspond`);
      err.code = 'P2025'; // même code que Prisma
      throw err;
    }
    Object.assign(row, args.data, { updatedAt: new Date() });
    return this.project(row, args.select, args.include);
  }

  /**
   * Mise à jour conditionnelle. Renvoie le nombre RÉEL de lignes touchées :
   * c'est ce qui rend testables l'idempotence et la course webhook/polling.
   */
  async updateMany(args: { where?: Row; data: Row }) {
    const targets = this.rows.filter((r) => matchWhere(r, args.where));
    for (const row of targets) Object.assign(row, args.data, { updatedAt: new Date() });
    return { count: targets.length };
  }

  async upsert(args: { where: Row; create: Row; update: Row }) {
    const row = this.rows.find((r) => matchWhere(r, args.where));
    if (row) return this.update({ where: args.where, data: args.update });
    return this.create({ data: { ...args.where, ...args.create } });
  }

  /** Suppression unitaire : renvoie la ligne supprimée, P2025 si absente (comme Prisma). */
  async delete(args: { where: Row; select?: Row; include?: Row }) {
    const idx = this.rows.findIndex((r) => matchWhere(r, args.where));
    if (idx === -1) {
      const err: any = new Error(`fakePrisma: ${this.name}.delete — aucune ligne ne correspond`);
      err.code = 'P2025';
      throw err;
    }
    const [row] = this.rows.splice(idx, 1);
    return this.project(row, args.select, args.include);
  }

  async deleteMany(args: { where?: Row } = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matchWhere(r, args.where));
    return { count: before - this.rows.length };
  }

  async count(args: { where?: Row } = {}) {
    return this.rows.filter((r) => matchWhere(r, args.where)).length;
  }
}

// ==================== instance ====================

const userTable = new Table('user', {
  prefix: 'user',
  defaults: () => ({
    email: null,
    firstName: 'Awa',
    lastName: 'Diop',
    gender: 'FEMALE',
    country: 'SN',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  // `subscription` est une relation 1-1 : `include` la résout comme une ligne
  // unique, ce que fait `project`. Utilisée par requireSubscriptionForMessaging.
  relations: {
    subscription: {
      table: () => subscriptionTable,
      localField: 'id',
      foreignField: 'userId',
    },
  },
});

const subscriptionTable = new Table('subscription', {
  prefix: 'sub',
  defaults: () => ({
    plan: 'FREE',
    status: 'PENDING',
    startsAt: null,
    expiresAt: null,
    cancelledAt: null,
    autoRenew: true,
    lastReminderAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  relations: {
    user: { table: () => userTable, localField: 'userId', foreignField: 'id' },
  },
});

const paymentTable = new Table('payment', {
  prefix: 'pay',
  defaults: () => ({
    subscriptionId: null,
    status: 'PENDING',
    currency: 'XOF',
    autoRenew: true,
    phoneNumber: null,
    providerTxId: null,
    providerRef: null,
    cinetpayTxId: null,
    webhookReceived: false,
    webhookPayload: null,
    failureReason: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  relations: {
    user: { table: () => userTable, localField: 'userId', foreignField: 'id' },
  },
});

const notificationTable = new Table('notification', {
  prefix: 'notif',
  defaults: () => ({ isRead: false, data: null, createdAt: new Date() }),
});

const photoTable = new Table('photo', {
  prefix: 'photo',
  defaults: () => ({
    isMain: false,
    order: 0,
    moderationStatus: 'PENDING',
    createdAt: new Date(),
  }),
  relations: {
    user: { table: () => userTable, localField: 'userId', foreignField: 'id' },
  },
});

export const fakePrisma = {
  user: userTable,
  subscription: subscriptionTable,
  payment: paymentTable,
  notification: notificationTable,
  photo: photoTable,
  /**
   * Les appels passés à `$transaction([...])` sont déjà des promesses en cours
   * (Prisma en fait autant côté client). On se contente de les attendre : le
   * rollback n'est pas simulé, aucun test ne repose dessus.
   */
  $transaction: (ops: Promise<any>[]) => Promise.all(ops),
  $disconnect: async () => {},
};

// ==================== helpers de test ====================

/** Vide toutes les tables (à appeler dans un `beforeEach`). */
export function resetDb() {
  userTable.clear();
  subscriptionTable.clear();
  paymentTable.clear();
  notificationTable.clear();
  photoTable.clear();
  idCounter = 0;
}

export function seedUser(data: Row = {}): Row {
  return userTable.insert({ id: 'user-test', email: 'awa@teranga.sn', ...data });
}

export function seedSubscription(data: Row): Row {
  return subscriptionTable.insert(data);
}

export function seedPayment(data: Row): Row {
  return paymentTable.insert(data);
}

/** Ajoute `n` photos au profil `userId` (ordre et photo principale cohérents). */
export function seedPhotos(userId: string, n: number): Row[] {
  const existing = photoTable.rows.filter((r) => r.userId === userId).length;
  return Array.from({ length: n }, (_, i) =>
    photoTable.insert({
      userId,
      url: `/uploads/${userId}-${existing + i}.jpg`,
      order: existing + i,
      isMain: existing + i === 0,
    }),
  );
}

/** Relit une ligne telle qu'elle est réellement persistée (pas la valeur de retour du service). */
export function readPayment(id: string): Row | undefined {
  const row = paymentTable.rows.find((r) => r.id === id);
  return row ? { ...row } : undefined;
}

export function readSubscription(userId: string): Row | undefined {
  const row = subscriptionTable.rows.find((r) => r.userId === userId);
  return row ? { ...row } : undefined;
}

export function allNotifications(): Row[] {
  return notificationTable.rows.map((r) => ({ ...r }));
}

export function allPayments(): Row[] {
  return paymentTable.rows.map((r) => ({ ...r }));
}
