"""Read-only, explicitly allowlisted experiment oracle. Never export credentials/QR/accounts."""
import argparse
import json
import sqlite3
from pathlib import Path


def inspect(database, visit, membership):
    uri = Path(database).resolve().as_uri() + '?mode=ro'
    with sqlite3.connect(uri, uri=True, timeout=5) as db:
        db.row_factory = sqlite3.Row
        def rows(sql, *args):
            return [dict(row) for row in db.execute(sql, args)]
        return {
            'visit': rows('SELECT id,table_id,active,state,payment_mode,service_mode FROM visits WHERE id=?', visit),
            'orders': rows('SELECT o.id,o.visit_id,o.status,o.payment_state,COALESCE(SUM(i.quantity*i.unit_price_vnd),0) total_vnd FROM orders o LEFT JOIN order_items i ON i.order_id=o.id WHERE o.visit_id=? GROUP BY o.id ORDER BY o.id', visit),
            'tickets': rows('SELECT id,visit_id,type,status FROM tickets WHERE visit_id=? ORDER BY id', visit),
            'receipts': rows('SELECT command_id,action,result_json FROM command_receipts WHERE principal=? ORDER BY created_at,command_id', 'membership:' + membership),
            'payments': rows('SELECT p.order_id,p.amount_vnd,p.state FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE o.visit_id=? ORDER BY p.created_at', visit),
            'events': rows('SELECT id,type,entity_id FROM business_events WHERE visit_id=? ORDER BY id', visit),
            'schema': db.execute('PRAGMA user_version').fetchone()[0],
        }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--visit', required=True)
    parser.add_argument('--membership', required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(args.db, args.visit, args.membership), ensure_ascii=True))
