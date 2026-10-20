import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import (
    r2_score,
    mean_absolute_percentage_error,
    mean_absolute_error,
    root_mean_squared_error,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "Network.csv")

CATEGORICAL_COLS = [
    "Service_Class",
    "Network_Slice",
    "Network_Function",
    "Deployment_Zone",
    "Traffic_Direction",
    "Network_Condition",
    "Energy_Management_Status",
]

DROP_COLS = [
    "Record_ID",
    "Timestamp",
    "Predicted_Energy_Requirement_kWh",
    "Future_Traffic_Demand_Mbps",
    "Future_Congestion_Index",
]

TRAFFIC_FEATURES = [
    "Peak_Time",
    "Traffic_Volume_Mbps",
    "Throughput_Mbps",
    "Hour",
    "Active_User_Count",
    "VNF_Instance_Count",
    "User_Plane_Load_Pct",
    "Resource_Utilization_Efficiency_Pct",
    "Congestion_Index",
    "Downlink_Traffic_Mbps",
    "Uplink_Traffic_Mbps",
    "Packet_Arrival_Rate_Kpps",
    "Memory_Utilization_Pct",
    "Active_Core_Nodes",
    "Service_Class",
    "Network_Slice",
    "Network_Condition",
    "Traffic_Direction",
]

CONGESTION_FEATURES = [
    "Peak_Time",
    "Traffic_Volume_Mbps",
    "Throughput_Mbps",
    "Hour",
    "Resource_Utilization_Efficiency_Pct",
    "User_Plane_Load_Pct",
    "Active_User_Count",
    "VNF_Instance_Count",
    "Congestion_Index",
    "Packet_Arrival_Rate_Kpps",
    "Memory_Utilization_Pct",
    "Downlink_Traffic_Mbps",
    "Uplink_Traffic_Mbps",
    "CPU_Utilization_Pct",
    "Service_Class",
    "Network_Slice",
    "Network_Condition",
]

ENERGY_FEATURES = [
    "Total_Power_Watt",
    "Energy_Consumption_kWh",
    "Traffic_Volume_Mbps",
    "Uplink_Traffic_Mbps",
    "Downlink_Traffic_Mbps",
    "Active_User_Count",
    "Congestion_Index",
    "Throughput_Mbps",
    "Energy_Efficiency_Mbps_per_kWh",
    "Carbon_Emission_kg",
    "Operational_Cost_USD",
    "CPU_Utilization_Pct",
    "Memory_Utilization_Pct",
    "VNF_Instance_Count",
    "Active_Core_Nodes",
    "Idle_Core_Nodes",
    "Power_per_Traffic",
    "Energy_Intensity",
    "Power_to_Energy_Ratio",
    "Energy_per_User",
    "Service_Class",
    "Network_Slice",
    "Network_Condition",
    "Energy_Management_Status",
]


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    feat_df = df.copy()
    eps = 1e-6
    if "Traffic_Volume_Mbps" in feat_df.columns and "Bandwidth_Allocation_MHz" in feat_df.columns:
        feat_df["Traffic_to_BW"] = feat_df["Traffic_Volume_Mbps"] / (feat_df["Bandwidth_Allocation_MHz"] + eps)
    if "Throughput_Mbps" in feat_df.columns and "Traffic_Volume_Mbps" in feat_df.columns:
        feat_df["Throughput_Ratio"] = feat_df["Throughput_Mbps"] / (feat_df["Traffic_Volume_Mbps"] + eps)
    if "User_Plane_Load_Pct" in feat_df.columns and "Control_Plane_Load_Pct" in feat_df.columns:
        feat_df["Load_Product"] = feat_df["User_Plane_Load_Pct"] * feat_df["Control_Plane_Load_Pct"]
    if "Active_Core_Nodes" in feat_df.columns and "Idle_Core_Nodes" in feat_df.columns:
        feat_df["Resource_Stress"] = feat_df["Active_Core_Nodes"] / (
            feat_df["Active_Core_Nodes"] + feat_df["Idle_Core_Nodes"] + eps
        )
    if "CPU_Utilization_Pct" in feat_df.columns and "Memory_Utilization_Pct" in feat_df.columns:
        feat_df["Compute_Load"] = (feat_df["CPU_Utilization_Pct"] + feat_df["Memory_Utilization_Pct"]) / 2.0
    if "Latency_ms" in feat_df.columns and "Packet_Loss_Rate_Pct" in feat_df.columns:
        feat_df["Network_Stress"] = feat_df["Latency_ms"] * (1.0 + feat_df["Packet_Loss_Rate_Pct"])

    if "Total_Power_Watt" in feat_df.columns and "Traffic_Volume_Mbps" in feat_df.columns:
        feat_df["Power_per_Traffic"] = feat_df["Total_Power_Watt"] / (feat_df["Traffic_Volume_Mbps"] + eps)
    if "Energy_Consumption_kWh" in feat_df.columns and "Throughput_Mbps" in feat_df.columns:
        feat_df["Energy_Intensity"] = feat_df["Energy_Consumption_kWh"] / (feat_df["Throughput_Mbps"] + eps)
    if "Total_Power_Watt" in feat_df.columns and "Energy_Consumption_kWh" in feat_df.columns:
        feat_df["Power_to_Energy_Ratio"] = feat_df["Total_Power_Watt"] / (feat_df["Energy_Consumption_kWh"] * 1000.0 + eps)
    if "Energy_Consumption_kWh" in feat_df.columns and "Active_User_Count" in feat_df.columns:
        feat_df["Energy_per_User"] = feat_df["Energy_Consumption_kWh"] / (feat_df["Active_User_Count"] + eps)

    return feat_df


def evaluate_regression(y_true, y_pred, target_name: str) -> dict:
    r2 = float(r2_score(y_true, y_pred))
    mape = float(mean_absolute_percentage_error(y_true, y_pred))
    accuracy_1_minus_mape = float((1.0 - mape) * 100.0)
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(root_mean_squared_error(y_true, y_pred))
    mean_val = float(np.mean(y_true))
    normalized_accuracy = float((1.0 - mae / mean_val) * 100.0)

    print(f"\n==================== Evaluation: {target_name} ====================")
    print(f"  R2 Score (Variance Explained)   : {r2 * 100:.2f}%  (R2 = {r2:.4f})")
    print(f"  Regression Accuracy (1 - MAPE)  : {accuracy_1_minus_mape:.2f}% (MAPE = {mape:.4f})")
    print(f"  Normalized Accuracy (1 - MAE/y) : {normalized_accuracy:.2f}%")
    print(f"  Mean Absolute Error (MAE)       : {mae:.4f}")
    print(f"  Root Mean Squared Error (RMSE)  : {rmse:.4f}")

    return {
        "r2": r2,
        "mape": mape,
        "mae": mae,
        "rmse": rmse,
        "accuracy_1_minus_mape": accuracy_1_minus_mape,
        "normalized_accuracy": normalized_accuracy,
    }


def plot_prediction_graph(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    target_name: str,
    unit: str = "kWh",
    num_samples: int = 100,
    save_path: str | None = None,
    show: bool = False,
):
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    n_pts = min(num_samples, len(y_true))

    r2 = r2_score(y_true, y_pred)
    mae = mean_absolute_error(y_true, y_pred)
    rmse = root_mean_squared_error(y_true, y_pred)

    fig, ax = plt.subplots(figsize=(12, 5))
    unit_str = f" ({unit})" if unit else ""

    ax.plot(
        range(n_pts),
        y_true[:n_pts],
        label=f"Original {target_name}",
        color="#2ca02c",
        linewidth=1.8,
        marker="o",
        markersize=3.5,
        alpha=0.9,
    )
    ax.plot(
        range(n_pts),
        y_pred[:n_pts],
        label=f"Predicted {target_name}",
        color="#d62728",
        linewidth=1.8,
        linestyle="--",
        marker="x",
        markersize=4.5,
        alpha=0.9,
    )
    ax.set_title(f"{target_name}: Original vs Predicted (First {n_pts} Samples)", fontsize=13, fontweight="bold")
    ax.set_xlabel("Sample Index", fontsize=11)
    ax.set_ylabel(f"{target_name}{unit_str}", fontsize=11)
    ax.legend(loc="upper right", frameon=True, fontsize=10)
    ax.grid(True, linestyle=":", alpha=0.6)

    metrics_text = f"$R^2$: {r2:.4f}  |  MAE: {mae:.4f}{' ' + unit if unit else ''}  |  RMSE: {rmse:.4f}{' ' + unit if unit else ''}"
    ax.text(
        0.02,
        0.93,
        metrics_text,
        transform=ax.transAxes,
        verticalalignment="top",
        bbox=dict(boxstyle="round,pad=0.4", facecolor="white", edgecolor="#cccccc", alpha=0.9),
        fontsize=10,
    )

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=300)
        print(f"  [Plot Saved] {save_path}")

    if show:
        plt.show()

    return fig


def predict_energy(
    input_data: dict | pd.DataFrame,
    traffic_model: HistGradientBoostingRegressor,
    energy_model: HistGradientBoostingRegressor,
    traffic_feature_cols: list[str],
    energy_feature_cols: list[str],
    congestion_ridge: Ridge | None = None,
    congestion_hgb: HistGradientBoostingRegressor | None = None,
    congestion_feature_cols: list[str] | None = None,
) -> dict:
    if isinstance(input_data, dict):
        input_df = pd.DataFrame([input_data])
    else:
        input_df = input_data.copy()

    input_df = engineer_features(input_df)

    t_cat = [c for c in TRAFFIC_FEATURES if c in CATEGORICAL_COLS and c in input_df.columns]
    t_num = [c for c in TRAFFIC_FEATURES if c not in CATEGORICAL_COLS and c in input_df.columns]
    traffic_input = input_df[t_num + t_cat].copy()
    traffic_input = pd.get_dummies(traffic_input, columns=t_cat, drop_first=True)
    traffic_input = traffic_input.reindex(columns=traffic_feature_cols, fill_value=0)

    predicted_traffic = traffic_model.predict(traffic_input.values)

    predicted_congestion = None
    if congestion_ridge is not None and congestion_hgb is not None and congestion_feature_cols is not None:
        c_cat = [c for c in CONGESTION_FEATURES if c in CATEGORICAL_COLS and c in input_df.columns]
        c_num = [c for c in CONGESTION_FEATURES if c not in CATEGORICAL_COLS and c in input_df.columns]
        congestion_input = input_df[c_num + c_cat].copy()
        congestion_input = pd.get_dummies(congestion_input, columns=c_cat, drop_first=True)
        congestion_input = congestion_input.reindex(columns=congestion_feature_cols, fill_value=0)
        c_chained = np.hstack([congestion_input.values, predicted_traffic[:, np.newaxis]])
        yc_r = congestion_ridge.predict(c_chained)
        yc_h = congestion_hgb.predict(c_chained)
        predicted_congestion = 0.5 * yc_r + 0.5 * yc_h

    e_cat = [c for c in ENERGY_FEATURES if c in CATEGORICAL_COLS and c in input_df.columns]
    e_num = [c for c in ENERGY_FEATURES if c not in CATEGORICAL_COLS and c in input_df.columns]
    energy_input = input_df[e_num + e_cat].copy()
    energy_input = pd.get_dummies(energy_input, columns=e_cat, drop_first=True)
    energy_input = energy_input.reindex(columns=energy_feature_cols, fill_value=0)

    energy_input_chained = np.hstack([energy_input.values, predicted_traffic[:, np.newaxis]])
    predicted_energy = energy_model.predict(energy_input_chained)

    if isinstance(input_data, dict):
        result = {
            "Future_Traffic_Demand_Mbps": float(predicted_traffic[0]),
            "Predicted_Energy_Requirement_kWh": float(predicted_energy[0]),
        }
        if predicted_congestion is not None:
            result["Future_Congestion_Index"] = float(predicted_congestion[0])
        return result

    result = {
        "Future_Traffic_Demand_Mbps": predicted_traffic,
        "Predicted_Energy_Requirement_kWh": predicted_energy,
    }
    if predicted_congestion is not None:
        result["Future_Congestion_Index"] = predicted_congestion
    return result


def train_energy_models(plot: bool = True, show_plots: bool = True):
    print(f"Loading dataset from: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)
    print(f"Dataset Shape: {df.shape} (Rows: {len(df)}, Columns: {len(df.columns)})")

    df_engineered = engineer_features(df)
    feature_df = df_engineered.drop(columns=DROP_COLS)
    feature_df_encoded = pd.get_dummies(feature_df, columns=CATEGORICAL_COLS, drop_first=True)

    feature_columns = feature_df_encoded.columns.tolist()
    print(f"Prepared {len(feature_columns)} training features.")

    y_traffic = df["Future_Traffic_Demand_Mbps"].values
    y_congestion = df["Future_Congestion_Index"].values
    y_energy = df["Predicted_Energy_Requirement_kWh"].values
    X = feature_df_encoded.values

    X_train, X_test, yt_train, yt_test, yc_train, yc_test, ye_train, ye_test = train_test_split(
        X, y_traffic, y_congestion, y_energy, test_size=0.2, random_state=42
    )

    t_cat = [c for c in TRAFFIC_FEATURES if c in CATEGORICAL_COLS]
    t_num = [c for c in TRAFFIC_FEATURES if c not in CATEGORICAL_COLS and c in df_engineered.columns]
    traffic_subset = pd.get_dummies(df_engineered[t_num + t_cat], columns=t_cat, drop_first=True)
    traffic_feature_cols = traffic_subset.columns.tolist()

    c_cat = list(dict.fromkeys([c for c in CONGESTION_FEATURES if c in CATEGORICAL_COLS]))
    c_num = [c for c in CONGESTION_FEATURES if c not in CATEGORICAL_COLS and c in df_engineered.columns]
    congestion_subset = pd.get_dummies(df_engineered[c_num + c_cat], columns=c_cat, drop_first=True)
    congestion_feature_cols = congestion_subset.columns.tolist()

    e_cat = list(dict.fromkeys([c for c in ENERGY_FEATURES if c in CATEGORICAL_COLS]))
    e_num = [c for c in ENERGY_FEATURES if c not in CATEGORICAL_COLS and c in df_engineered.columns]
    energy_subset = pd.get_dummies(df_engineered[e_num + e_cat], columns=e_cat, drop_first=True)
    energy_feature_cols = energy_subset.columns.tolist()

    Xt_train, Xt_test, _, _ = train_test_split(traffic_subset.values, y_traffic, test_size=0.2, random_state=42)
    Xc_train, Xc_test, _, _ = train_test_split(congestion_subset.values, y_congestion, test_size=0.2, random_state=42)
    Xe_train, Xe_test, _, _ = train_test_split(energy_subset.values, y_energy, test_size=0.2, random_state=42)

    print("\nTraining Stage 1 Model: Future_Traffic_Demand_Mbps...")
    traffic_model = HistGradientBoostingRegressor(
        max_iter=350,
        learning_rate=0.07,
        min_samples_leaf=20,
        random_state=42,
    )
    traffic_model.fit(X_train, yt_train)
    yt_pred = traffic_model.predict(X_test)
    evaluate_regression(yt_test, yt_pred, "Future_Traffic_Demand_Mbps")

    traffic_pred_model = HistGradientBoostingRegressor(
        max_iter=350,
        learning_rate=0.07,
        min_samples_leaf=20,
        random_state=42,
    )
    traffic_pred_model.fit(Xt_train, yt_train)

    print("\nTraining Stage 2 Model: Future_Congestion_Index (Chained with predicted traffic)...")
    pt_train = traffic_model.predict(X_train)[:, np.newaxis]
    pt_test = yt_pred[:, np.newaxis]

    X_train_c = np.hstack([X_train, pt_train])
    X_test_c = np.hstack([X_test, pt_test])

    ridge_m = Ridge(alpha=10.0)
    ridge_m.fit(X_train_c, yc_train)

    hgb_m = HistGradientBoostingRegressor(
        loss="absolute_error",
        max_iter=350,
        learning_rate=0.08,
        min_samples_leaf=20,
        random_state=42,
    )
    hgb_m.fit(X_train_c, yc_train)

    pt_sub_train = traffic_pred_model.predict(Xt_train)[:, np.newaxis]
    pt_sub_test = traffic_pred_model.predict(Xt_test)[:, np.newaxis]
    Xc_train_chained = np.hstack([Xc_train, pt_sub_train])
    congestion_pred_ridge = Ridge(alpha=10.0)
    congestion_pred_ridge.fit(Xc_train_chained, yc_train)
    congestion_pred_hgb = HistGradientBoostingRegressor(
        loss="absolute_error",
        max_iter=350,
        learning_rate=0.08,
        min_samples_leaf=20,
        random_state=42,
    )
    congestion_pred_hgb.fit(Xc_train_chained, yc_train)

    print("\nTraining Stage 3 Model: Predicted_Energy_Requirement_kWh (Chained with predicted traffic)...")
    X_train_e = np.hstack([X_train, pt_train])
    X_test_e = np.hstack([X_test, pt_test])

    energy_model = HistGradientBoostingRegressor(
        max_iter=350,
        learning_rate=0.07,
        min_samples_leaf=20,
        random_state=42,
    )
    energy_model.fit(X_train_e, ye_train)
    ye_pred = energy_model.predict(X_test_e)
    evaluate_regression(ye_test, ye_pred, "Predicted_Energy_Requirement_kWh")

    print("  Training prediction energy model on feature subset...")
    Xe_train_chained = np.hstack([Xe_train, pt_sub_train])
    energy_pred_model = HistGradientBoostingRegressor(
        max_iter=350,
        learning_rate=0.07,
        min_samples_leaf=20,
        random_state=42,
    )
    energy_pred_model.fit(Xe_train_chained, ye_train)

    if plot:
        print("\nPlotting evaluation graph for Predicted Energy Requirement...")
        energy_plot_path = os.path.join(BASE_DIR, "energy_requirement_evaluation.png")
        plot_prediction_graph(
            y_true=ye_test,
            y_pred=ye_pred,
            target_name="Predicted Energy Requirement",
            unit="kWh",
            num_samples=100,
            save_path=energy_plot_path,
            show=show_plots,
        )

    return {
        "traffic_model": traffic_pred_model,
        "congestion_ridge": congestion_pred_ridge,
        "congestion_hgb": congestion_pred_hgb,
        "energy_model": energy_pred_model,
        "traffic_feature_cols": traffic_feature_cols,
        "congestion_feature_cols": congestion_feature_cols,
        "energy_feature_cols": energy_feature_cols,
        "evaluation_data": {
            "ye_test": ye_test,
            "ye_pred": ye_pred,
            "yt_test": yt_test,
            "yt_pred": yt_pred,
            "yc_test": yc_test,
        },
    }


if __name__ == "__main__":
    artifacts = train_energy_models()
    print("\n\n========== Predict Future Energy State ==========")
    print("Enter the 5 network features for Congestion / Traffic Model:\n")

    traffic_volume   = float(input("  Traffic_Volume_Mbps    : "))
    active_users     = float(input("  Active_User_Count      : "))
    congestion_idx   = float(input("  Congestion_Index       : "))
    uplink_traffic   = float(input("  Uplink_Traffic_Mbps    : "))
    downlink_traffic  = float(input("  Downlink_Traffic_Mbps  : "))

    print("\nEnter the 2 Energy features:")
    total_power      = float(input("  Total_Power_Watt       : "))
    energy_consump   = float(input("  Energy_Consumption_kWh : "))

    user_input = {
        "Traffic_Volume_Mbps":    traffic_volume,
        "Active_User_Count":      active_users,
        "Congestion_Index":       congestion_idx,
        "Uplink_Traffic_Mbps":    uplink_traffic,
        "Downlink_Traffic_Mbps":  downlink_traffic,
        "Total_Power_Watt":       total_power,
        "Energy_Consumption_kWh": energy_consump,
    }

    predictions = predict_energy(
        input_data=user_input,
        traffic_model=artifacts["traffic_model"],
        energy_model=artifacts["energy_model"],
        traffic_feature_cols=artifacts["traffic_feature_cols"],
        energy_feature_cols=artifacts["energy_feature_cols"],
        congestion_ridge=artifacts["congestion_ridge"],
        congestion_hgb=artifacts["congestion_hgb"],
        congestion_feature_cols=artifacts["congestion_feature_cols"],
    )

    print("\n---------- Prediction Results ----------")
    print(f"  Future Traffic Demand        : {predictions['Future_Traffic_Demand_Mbps']:.3f} Mbps")
    if "Future_Congestion_Index" in predictions:
        print(f"  Future Congestion Index      : {predictions['Future_Congestion_Index']:.4f}")
    print(f"  Predicted Energy Requirement : {predictions['Predicted_Energy_Requirement_kWh']:.4f} kWh")
