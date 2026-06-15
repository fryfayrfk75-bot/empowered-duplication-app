import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`#graphql
    query inventory {
      products(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id title status
            images(first: 1) { edges { node { url } } }
            variants(first: 20) {
              edges {
                node {
                  id title price
                  inventoryQuantity
                  inventoryItem { id }
                  selectedOptions { name value }
                }
              }
            }
          }
        }
      }
      locations(first: 5) {
        edges { node { id name } }
      }
    }
  `);

  const data = await res.json();
  return {
    products: data.data.products.edges.map((e) => e.node),
    locations: data.data.locations.edges.map((e) => e.node),
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const inventoryItemId = form.get("inventoryItemId");
  const locationId = form.get("locationId");
  const quantity = parseInt(form.get("quantity"), 10);

  await admin.graphql(`#graphql
    mutation setInventory($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup { id }
        userErrors { field message }
      }
    }`, {
    variables: {
      input: {
        name: "available",
        reason: "correction",
        quantities: [{
          inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
          locationId: `gid://shopify/Location/${locationId}`,
          quantity,
        }],
      },
    },
  });

  return { success: true };
};

export default function Inventory() {
  const { products, locations } = useLoaderData();
  const fetcher = useFetcher();
  const locationId = locations[0]?.id?.split("/").pop() || "";

  const totalItems = products.reduce((s, p) => s + p.variants.edges.length, 0);
  const outOfStock = products.reduce((s, p) => s + p.variants.edges.filter(({ node: v }) => v.inventoryQuantity === 0).length, 0);
  const lowStock = products.reduce((s, p) => s + p.variants.edges.filter(({ node: v }) => v.inventoryQuantity > 0 && v.inventoryQuantity <= 5).length, 0);

  return (
    <s-page heading="إدارة المخزون">
      {/* Summary */}
      <s-section>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { label: "إجمالي المتغيرات", value: totalItems, color: "#3b82f6" },
            { label: "نفد المخزون", value: outOfStock, color: "#ef4444" },
            { label: "مخزون منخفض (≤5)", value: lowStock, color: "#f59e0b" },
          ].map((m) => (
            <div key={m.label} style={{ background: "#1a1a1a", border: `1px solid ${m.color}33`, borderTop: `3px solid ${m.color}`, borderRadius: 10, padding: "16px 24px", flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      </s-section>

      {/* Products */}
      {products.map((product) => (
        <s-section key={product.id} heading={product.title}>
          <div style={{ display: "grid", gap: 8 }}>
            {product.variants.edges.map(({ node: variant }) => {
              const qty = variant.inventoryQuantity;
              const qtyColor = qty === 0 ? "#ef4444" : qty <= 5 ? "#f59e0b" : "#22c55e";
              const inventoryItemId = variant.inventoryItem?.id?.split("/").pop();
              const variantLabel = variant.title === "Default Title" ? "الافتراضي" : variant.title;

              return (
                <div key={variant.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: "#111", borderRadius: 8, border: "1px solid #1e1e1e" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#ddd", fontSize: 13 }}>{variantLabel}</div>
                    <div style={{ fontSize: 12, color: "#C9A96E", marginTop: 2 }}>{parseFloat(variant.price).toLocaleString()} —</div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: qtyColor + "22", color: qtyColor, border: `1px solid ${qtyColor}55`, borderRadius: 6, padding: "4px 12px", fontSize: 14, fontWeight: 700, minWidth: 48, textAlign: "center" }}>
                      {qty}
                    </span>

                    {inventoryItemId && locationId && (
                      <fetcher.Form method="post" style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
                        <input type="hidden" name="locationId" value={locationId} />
                        <input
                          name="quantity"
                          type="number"
                          defaultValue={qty}
                          min="0"
                          style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1px solid #333", background: "#1a1a1a", color: "#fff", fontSize: 13, outline: "none", textAlign: "center" }}
                        />
                        <button type="submit" style={{ padding: "4px 12px", borderRadius: 6, background: "#C9A96E22", color: "#C9A96E", border: "1px solid #C9A96E55", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          تحديث
                        </button>
                      </fetcher.Form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </s-section>
      ))}
    </s-page>
  );
}

export const headers = (h) => boundary.headers(h);
