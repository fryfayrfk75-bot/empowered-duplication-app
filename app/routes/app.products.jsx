import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`#graphql
    query products {
      products(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id title handle status totalInventory
            priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
            images(first: 1) { edges { node { url altText } } }
            variants(first: 20) {
              edges {
                node {
                  id title price inventoryQuantity
                  selectedOptions { name value }
                }
              }
            }
            createdAt
          }
        }
      }
    }
  `);

  const data = await res.json();
  return { products: data.data.products.edges.map((e) => e.node) };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "toggle_status") {
    const productId = form.get("productId");
    const status = form.get("status");
    const newStatus = status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    await admin.graphql(`#graphql
      mutation updateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id status }
          userErrors { field message }
        }
      }`, { variables: { input: { id: productId, status: newStatus } } });
    return { success: true };
  }

  if (intent === "delete") {
    const productId = form.get("productId");
    await admin.graphql(`#graphql
      mutation deleteProduct($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors { field message }
        }
      }`, { variables: { input: { id: productId } } });
    return { success: true };
  }

  return { success: false };
};

const STATUS = {
  ACTIVE: { label: "نشط", color: "#22c55e" },
  DRAFT:  { label: "مسودة", color: "#f59e0b" },
  ARCHIVED: { label: "مؤرشف", color: "#6b7280" },
};

export default function Products() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();

  return (
    <s-page heading="المنتجات">
      <s-section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ color: "#666", fontSize: 13 }}>{products.length} منتج</div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {products.map((product) => {
            const img = product.images.edges[0]?.node?.url;
            const st = STATUS[product.status] || STATUS.DRAFT;
            const minPrice = product.priceRangeV2.minVariantPrice;
            const maxPrice = product.priceRangeV2.maxVariantPrice;
            const priceStr = minPrice.amount === maxPrice.amount
              ? `${parseFloat(minPrice.amount).toLocaleString()} ${minPrice.currencyCode}`
              : `${parseFloat(minPrice.amount).toLocaleString()} – ${parseFloat(maxPrice.amount).toLocaleString()} ${minPrice.currencyCode}`;

            return (
              <div key={product.id} style={{
                display: "flex", gap: 16, alignItems: "center",
                background: "#1a1a1a", border: "1px solid #2a2a2a",
                borderRadius: 10, padding: 16,
              }}>
                {/* Image */}
                <div style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", background: "#111", flexShrink: 0 }}>
                  {img ? <img src={img} alt={product.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 24 }}>📦</div>}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 14, marginBottom: 4 }}>{product.title}</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ background: st.color + "22", color: st.color, border: `1px solid ${st.color}55`, borderRadius: 4, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                    <span style={{ color: "#C9A96E", fontSize: 13, fontWeight: 600 }}>{priceStr}</span>
                    <span style={{ color: "#666", fontSize: 12 }}>المخزون: {product.totalInventory}</span>
                    <span style={{ color: "#555", fontSize: 12 }}>{product.variants.edges.length} متغير</span>
                  </div>

                  {/* Variants */}
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {product.variants.edges.slice(0, 6).map(({ node: v }) => (
                      <span key={v.id} style={{ background: "#111", border: "1px solid #333", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: v.inventoryQuantity === 0 ? "#ef4444" : "#888" }}>
                        {v.title !== "Default Title" ? v.title : "الافتراضي"}: {v.inventoryQuantity}
                      </span>
                    ))}
                    {product.variants.edges.length > 6 && <span style={{ fontSize: 11, color: "#555" }}>+{product.variants.edges.length - 6} آخر</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="toggle_status" />
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="status" value={product.status} />
                    <button type="submit" style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%", background: product.status === "ACTIVE" ? "#f59e0b22" : "#22c55e22", color: product.status === "ACTIVE" ? "#f59e0b" : "#22c55e", border: `1px solid ${product.status === "ACTIVE" ? "#f59e0b55" : "#22c55e55"}` }}>
                      {product.status === "ACTIVE" ? "إيقاف" : "تفعيل"}
                    </button>
                  </fetcher.Form>

                  <a href={`/app/inventory?product=${product.id.split("/").pop()}`}
                    style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: "none", textAlign: "center", background: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f655" }}>
                    المخزون
                  </a>

                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="productId" value={product.id} />
                    <button type="submit" onClick={(e) => { if (!confirm(`حذف "${product.title}"؟`)) e.preventDefault(); }}
                      style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%", background: "#ef444422", color: "#ef4444", border: "1px solid #ef444455" }}>
                      حذف
                    </button>
                  </fetcher.Form>
                </div>
              </div>
            );
          })}
        </div>

        {products.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#444" }}>لا توجد منتجات</div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (h) => boundary.headers(h);
