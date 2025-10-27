import mysql from 'mysql2/promise';

const {
  DB_HOST = '139.129.33.252',
  DB_PORT = 3306,
  DB_USER = 'bluejakky',
  DB_PASSWORD = 'Qq20252025@',
  DB_NAME = 'goup',
} = process.env;

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}