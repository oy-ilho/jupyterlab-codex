# ---
# jupyter:
#   jupytext:
#     formats: ipynb,py:percent
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.19.1
#   kernelspec:
#     display_name: Python 3 (ipykernel)
#     language: python
#     name: python3
# ---

# %%
import numpy as np
import matplotlib.pyplot as plt

# %%
# 1D time-dependent Schrodinger equation simulation (hbar = m = 1).
# Method: split-operator (FFT), which keeps time evolution numerically stable.

def split_operator_step(psi_state, phase_v_half, phase_t):
    # One split-operator update: V/2 -> T -> V/2
    psi_state = phase_v_half * psi_state
    psi_k_state = np.fft.fft(psi_state)
    psi_k_state *= phase_t
    psi_state = np.fft.ifft(psi_k_state)
    psi_state = phase_v_half * psi_state
    return psi_state


# %%
# Simulation helpers
def _validate_simulation_params(
    hbar, mass, grid_size, x_min, x_max, dt, steps, save_every, sigma, barrier_width, barrier_region
):
    if grid_size <= 0:
        raise ValueError("grid_size must be positive.")
    if x_max <= x_min:
        raise ValueError("x_max must be greater than x_min.")
    if dt <= 0:
        raise ValueError("dt must be positive.")
    if steps < 0:
        raise ValueError("steps must be non-negative.")
    if save_every <= 0:
        raise ValueError("save_every must be positive.")
    if mass <= 0:
        raise ValueError("mass must be positive.")
    if hbar <= 0:
        raise ValueError("hbar must be positive.")
    if sigma <= 0:
        raise ValueError("sigma must be positive.")
    if barrier_width <= 0:
        raise ValueError("barrier_width must be positive.")
    if barrier_region < 0:
        raise ValueError("barrier_region must be non-negative.")


def _initialize_system(
    hbar, mass, grid_size, x_min, x_max, dt, barrier_height, barrier_width, x0, sigma, k0
):
    x = np.linspace(x_min, x_max, grid_size, endpoint=False)
    dx = x[1] - x[0]
    k = 2.0 * np.pi * np.fft.fftfreq(grid_size, d=dx)

    V = barrier_height * np.exp(-(x / barrier_width) ** 2)
    psi = np.exp(-((x - x0) ** 2) / (2.0 * sigma**2)) * np.exp(1j * k0 * x)
    psi /= np.sqrt(np.sum(np.abs(psi) ** 2) * dx)

    phase_v_half = np.exp(-1j * V * dt / (2.0 * hbar))
    T_k = (hbar**2) * (k**2) / (2.0 * mass)
    phase_t = np.exp(-1j * T_k * dt / hbar)
    return x, dx, k, V, psi, phase_v_half, phase_t


def _record_observables(psi, x, dx, k, hbar):
    density = np.abs(psi) ** 2
    norm = np.sum(density) * dx

    x_mean = np.sum(x * density) * dx
    x2_mean = np.sum((x**2) * density) * dx
    psi_k = np.fft.fft(psi)
    p_psi = np.fft.ifft(hbar * k * psi_k)
    p2_psi = np.fft.ifft((hbar * k) ** 2 * psi_k)
    p_mean = np.real(np.sum(np.conj(psi) * p_psi) * dx)
    p2_mean = np.real(np.sum(np.conj(psi) * p2_psi) * dx)

    x_var = max(x2_mean - x_mean**2, 0.0)
    p_var = max(p2_mean - p_mean**2, 0.0)
    uncertainty = np.sqrt(x_var) * np.sqrt(p_var)
    return density, norm, x_mean, p_mean, uncertainty


def _compute_diagnostics(final_density, x, dx, barrier_region, uncertainty_history):
    reflection = np.sum(final_density[x < -barrier_region]) * dx
    transmission = np.sum(final_density[x > barrier_region]) * dx
    near_barrier = np.sum(final_density[np.abs(x) <= barrier_region]) * dx

    return {
        "final_norm": np.sum(final_density) * dx,
        "reflection": reflection,
        "transmission": transmission,
        "near_barrier": near_barrier,
        "probability_sum": reflection + transmission + near_barrier,
        "min_uncertainty": float(np.min(uncertainty_history)),
    }


# %%
# Main simulation
def simulate_1d_quantum_scattering(
    hbar=1.0,
    mass=1.0,
    grid_size=2048,
    x_min=-100.0,
    x_max=100.0,
    dt=0.05,
    steps=900,
    save_every=90,
    barrier_height=1.6,
    barrier_width=2.2,
    x0=-35.0,
    sigma=3.5,
    k0=1.6,
    barrier_region=6.0,
):
    _validate_simulation_params(
        hbar,
        mass,
        grid_size,
        x_min,
        x_max,
        dt,
        steps,
        save_every,
        sigma,
        barrier_width,
        barrier_region,
    )
    x, dx, k, V, psi, phase_v_half, phase_t = _initialize_system(
        hbar, mass, grid_size, x_min, x_max, dt, barrier_height, barrier_width, x0, sigma, k0
    )

    snapshots = []
    times = []
    norm_history = []
    x_mean_history = []
    p_mean_history = []
    uncertainty_history = []

    for n in range(steps + 1):
        if n % save_every == 0:
            density, norm, x_mean, p_mean, uncertainty = _record_observables(psi, x, dx, k, hbar)
            snapshots.append(density.copy())
            times.append(n * dt)
            norm_history.append(norm)
            x_mean_history.append(x_mean)
            p_mean_history.append(p_mean)
            uncertainty_history.append(uncertainty)

        psi = split_operator_step(psi, phase_v_half, phase_t)

    final_density = np.abs(psi) ** 2
    diagnostics = _compute_diagnostics(final_density, x, dx, barrier_region, uncertainty_history)

    return {
        "x": x,
        "V": V,
        "snapshots": snapshots,
        "times": times,
        "norm_history": norm_history,
        "x_mean_history": x_mean_history,
        "p_mean_history": p_mean_history,
        "uncertainty_history": uncertainty_history,
        "diagnostics": diagnostics,
    }


# %%
# Plot helpers
def _plot_density_panel(ax, x, snapshots, times, V):
    for density, t in zip(snapshots, times):
        ax.plot(x, density, label=f"t={t:.1f}")
    vmax = np.max(V)
    if vmax > 0:
        scale = np.max(snapshots[0]) / vmax
        ax.plot(x, V * scale, "--", linewidth=2, label="Barrier (scaled)")
    ax.set_title("1D Quantum Wave Packet Scattering")
    ax.set_xlabel("x")
    ax.set_ylabel(r"Probability density $|\psi|^2$")
    ax.legend()
    ax.grid(alpha=0.25)


def _plot_norm_panel(ax, times, norm_history):
    ax.plot(times, norm_history, marker="o")
    ax.set_title("Normalization Conservation Check")
    ax.set_xlabel("time")
    ax.set_ylabel("Integral |psi|^2 dx")
    ax.grid(alpha=0.25)


def _plot_expectation_panel(ax, times, x_mean_history, p_mean_history):
    ax.plot(times, x_mean_history, marker="o", label="<x>")
    ax.plot(times, p_mean_history, marker="s", label="<p>")
    ax.set_title("Expectation Values Over Time")
    ax.set_xlabel("time")
    ax.set_ylabel("value")
    ax.legend()
    ax.grid(alpha=0.25)


def _plot_uncertainty_panel(ax, times, uncertainty_history, hbar):
    ax.plot(times, uncertainty_history, marker="^", label="DxDp")
    ax.axhline(0.5 * hbar, linestyle="--", color="red", label="hbar/2")
    ax.set_title("Uncertainty Principle Check")
    ax.set_xlabel("time")
    ax.set_ylabel("DxDp")
    ax.legend()
    ax.grid(alpha=0.25)


# %%
def plot_density_3d(result):
    x = result["x"]
    times = np.array(result["times"])
    snapshots = np.array(result["snapshots"])

    X, T = np.meshgrid(x, times)
    fig = plt.figure(figsize=(10, 6))
    ax = fig.add_subplot(111, projection="3d")
    ax.plot_surface(X, T, snapshots, cmap="viridis", linewidth=0, antialiased=True)
    ax.set_title("Probability Density Surface")
    ax.set_xlabel("x")
    ax.set_ylabel("time")
    ax.set_zlabel(r"$|\psi|^2$")
    plt.tight_layout()
    plt.show()


# %%
# Plot entrypoint
def plot_results(result, hbar=1.0):
    x = result["x"]
    V = result["V"]
    snapshots = result["snapshots"]
    times = result["times"]
    norm_history = result["norm_history"]
    x_mean_history = result["x_mean_history"]
    p_mean_history = result["p_mean_history"]
    uncertainty_history = result["uncertainty_history"]
    fig, axes = plt.subplots(4, 1, figsize=(10, 14), sharex=False)

    _plot_density_panel(axes[0], x, snapshots, times, V)
    _plot_norm_panel(axes[1], times, norm_history)
    _plot_expectation_panel(axes[2], times, x_mean_history, p_mean_history)
    _plot_uncertainty_panel(axes[3], times, uncertainty_history, hbar)

    plt.tight_layout()
    plt.show()
    plot_density_3d(result)


# %%
def validate_diagnostics(diagnostics, hbar=1.0, tol=1e-3):
    """Return validation checks for core physical constraints."""
    uncertainty_bound = 0.5 * hbar
    reflection = diagnostics["reflection"]
    transmission = diagnostics["transmission"]
    near_barrier = diagnostics["near_barrier"]
    finite_values = np.all(
        np.isfinite(
            [
                diagnostics["final_norm"],
                reflection,
                transmission,
                near_barrier,
                diagnostics["probability_sum"],
                diagnostics["min_uncertainty"],
                uncertainty_bound,
            ]
        )
    )
    checks = {
        "diagnostics_finite": bool(finite_values),
        "norm_close_to_one": bool(abs(diagnostics["final_norm"] - 1.0) <= tol),
        "probability_conserved": bool(abs(diagnostics["probability_sum"] - 1.0) <= tol),
        "probability_terms_nonnegative": bool(
            reflection >= -tol and transmission >= -tol and near_barrier >= -tol
        ),
        "probability_terms_le_one": bool(
            reflection <= 1.0 + tol
            and transmission <= 1.0 + tol
            and near_barrier <= 1.0 + tol
        ),
        "uncertainty_respected": bool(diagnostics["min_uncertainty"] + tol >= uncertainty_bound),
    }
    checks["all_passed"] = all(checks.values())
    return checks


# %%
def main():
    hbar = 1.0
    result = simulate_1d_quantum_scattering(hbar=hbar)
    diag = result["diagnostics"]
    checks = validate_diagnostics(diag, hbar=hbar)

    print(f"Final normalization (should be ~1): {diag['final_norm']:.6f}")
    print(f"Reflection probability    : {diag['reflection']:.6f}")
    print(f"Transmission probability  : {diag['transmission']:.6f}")
    print(f"Near-barrier probability  : {diag['near_barrier']:.6f}")
    print(f"R + T + Near-barrier      : {diag['probability_sum']:.6f}")
    print(
        "Min uncertainty DxDp      : "
        f"{diag['min_uncertainty']:.6f} (>= {0.5 * hbar:.3f})"
    )
    print(f"Validation all passed      : {checks['all_passed']}")

    for name, passed in checks.items():
        if name == "all_passed":
            continue
        print(f"  - {name:25}: {passed}")

    plot_results(result, hbar=hbar)


if __name__ == "__main__":
    main()
