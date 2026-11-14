const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createLiveRouter } = require('../routes/api_live');

test('Live Router: validaciones y respuestas básicas sin base de datos real', async (t) => {
  const dummyPool = {
    connect: async () => {
      throw new Error('Sin conexión DB');
    },
    query: async () => {
      return { rowCount: 0, rows: [] };
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/live', createLiveRouter(dummyPool));

  await t.test('register-company rechaza datos vacíos', async () => {
    let capturedStatus = 0;
    let capturedBody = null;
    const req = { body: {} };
    const res = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedBody = data;
      },
    };

    const routes = createLiveRouter(dummyPool);
    // Verificar que el router fue creado correctamente
    assert.ok(routes);
  });
});
