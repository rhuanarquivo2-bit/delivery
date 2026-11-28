import { describe, expect, it } from "vitest";
import { nextStatus } from "../order-status";
import { changeDue, discountPercent, flavorsPrice, optionErrors, unitPrice } from "../pricing";
import type { Category } from "../types";

const pizzas: Category = {
  id: "c1",
  store_id: "s",
  name: "Pizzas",
  description: null,
  has_sizes: true,
  half_price_rule: "highest",
  active: true,
  sort_order: 0,
  sizes: [
    { id: "broto", category_id: "c1", name: "Broto", max_flavors: 1, sort_order: 0 },
    { id: "grande", category_id: "c1", name: "Grande", max_flavors: 2, sort_order: 1 },
  ],
  groups: [
    {
      id: "borda",
      category_id: "c1",
      name: "Borda",
      min_select: 0,
      max_select: 1,
      sort_order: 0,
      options: [{ id: "catupiry", group_id: "borda", name: "Catupiry", price_cents: 800, active: true, sort_order: 0 }],
    },
  ],
  products: [
    {
      id: "calabresa",
      category_id: "c1",
      name: "Calabresa",
      description: null,
      image_url: null,
      price_cents: null,
      active: true,
      sort_order: 0,
      prices: [
        { product_id: "calabresa", size_id: "broto", price_cents: 3000 },
        { product_id: "calabresa", size_id: "grande", price_cents: 5000 },
      ],
    },
    {
      id: "portuguesa",
      category_id: "c1",
      name: "Portuguesa",
      description: null,
      image_url: null,
      price_cents: null,
      active: true,
      sort_order: 1,
      prices: [{ product_id: "portuguesa", size_id: "grande", price_cents: 6000 }],
    },
  ],
};

const base = { productId: "calabresa", flavorIds: [], optionIds: [], quantity: 1, notes: "" };

describe("preço de pizza", () => {
  it("cobra pelo sabor mais caro ou pela média arredondada para cima", () => {
    expect(flavorsPrice([5000, 6000], "highest")).toBe(6000);
    expect(flavorsPrice([5000, 6001], "average")).toBe(5501);
  });

  it("soma sabores e adicionais como o banco", () => {
    expect(unitPrice(pizzas, { ...base, sizeId: "grande" })).toBe(5000);
    expect(unitPrice(pizzas, { ...base, sizeId: "grande", flavorIds: ["portuguesa"], optionIds: ["catupiry"] })).toBe(
      6800,
    );
    expect(unitPrice({ ...pizzas, half_price_rule: "average" }, { ...base, sizeId: "grande", flavorIds: ["portuguesa"] })).toBe(5500);
  });

  it("não calcula sem tamanho ou com sabor que não existe no tamanho", () => {
    expect(unitPrice(pizzas, { ...base, sizeId: null })).toBeNull();
    expect(unitPrice(pizzas, { ...base, sizeId: "broto", flavorIds: ["portuguesa"] })).toBeNull();
  });
});

describe("adicionais", () => {
  it("valida mínimo e máximo por grupo", () => {
    const obrigatorio = { ...pizzas, groups: [{ ...pizzas.groups[0], min_select: 1 }] };
    expect(optionErrors(obrigatorio, [])).toEqual({ borda: "Escolha 1 opção." });
    expect(optionErrors(obrigatorio, ["catupiry"])).toEqual({});
  });
});

describe("escolha do produto (sabor do refrigerante)", () => {
  const sabor = {
    id: "sabor",
    category_id: "bebidas",
    product_id: "lata",
    name: "Sabor",
    min_select: 1,
    max_select: 1,
    sort_order: 0,
    options: [
      { id: "coca", group_id: "sabor", name: "Coca-Cola", price_cents: 0, active: true, sort_order: 0 },
      { id: "zero", group_id: "sabor", name: "Coca Zero", price_cents: 50, active: true, sort_order: 1 },
    ],
  };
  const lata = {
    id: "lata",
    category_id: "bebidas",
    name: "Refrigerante Lata",
    description: null,
    image_url: null,
    price_cents: 700,
    active: true,
    sort_order: 0,
    prices: [],
    groups: [sabor],
  };
  const agua = { ...lata, id: "agua", name: "Água", price_cents: 350, groups: [] };
  const bebidas = {
    ...pizzas,
    id: "bebidas",
    has_sizes: false,
    sizes: [],
    groups: [],
    products: [lata, agua],
  };
  const sel = { ...base, productId: "lata", sizeId: null };

  it("exige o sabor só no produto que tem a escolha", () => {
    expect(optionErrors(bebidas, [], lata)).toEqual({ sabor: "Escolha 1 opção." });
    expect(optionErrors(bebidas, ["coca"], lata)).toEqual({});
    expect(optionErrors(bebidas, [], agua)).toEqual({});
  });

  it("soma a diferença do sabor e não calcula sem sabor ou com sabor que acabou", () => {
    expect(unitPrice(bebidas, { ...sel, optionIds: ["coca"] })).toBe(700);
    expect(unitPrice(bebidas, { ...sel, optionIds: ["zero"] })).toBe(750);
    expect(unitPrice(bebidas, sel)).toBeNull();
    expect(unitPrice(bebidas, { ...sel, optionIds: ["fanta-que-acabou"] })).toBeNull();
    expect(unitPrice(bebidas, { ...sel, productId: "agua" })).toBe(350);
  });
});

describe("troco e status", () => {
  it("calcula o troco", () => {
    expect(changeDue(10530, 15000)).toBe(4470);
    expect(changeDue(10530, null)).toBeNull();
    expect(changeDue(10530, 10530)).toBeNull();
  });

  it("segue o fluxo de entrega e de retirada", () => {
    expect(nextStatus("pending", "delivery")).toBe("preparing");
    expect(nextStatus("ready", "delivery")).toBe("out_for_delivery");
    expect(nextStatus("ready", "pickup")).toBe("delivered");
    expect(nextStatus("delivered", "pickup")).toBeNull();
  });
});

describe("discountPercent", () => {
  it("calcula o selo de desconto arredondado", () => {
    expect(discountPercent(5000, 4000)).toBe(20);
    expect(discountPercent(3990, 2990)).toBe(25);
  });
  it("não mostra selo sem desconto", () => {
    expect(discountPercent(3000, 3000)).toBeNull();
    expect(discountPercent(null, 3000)).toBeNull();
    expect(discountPercent(3000, null)).toBeNull();
    expect(discountPercent(0, 0)).toBeNull();
    expect(discountPercent(10000, 9990)).toBeNull();
  });
});
