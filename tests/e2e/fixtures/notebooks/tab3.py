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


def momentum_operator(psi_state, k, hbar):
    """Apply p = -i*hbar*d/dx with a spectral derivative."""
    psi_k_state = np.fft.fft(psi_state)
    return np.fft.ifft(hbar * k * psi_k_state)


def momentum_squared_operator(psi_state, k, hbar):
    """Apply p^2 operator with a spectral derivative."""
    psi_k_state = np.fft.fft(psi_state)
    return np.fft.ifft((hbar * k) ** 2 * psi_k_state)


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

    x = np.linspace(x_min, x_max, grid_size, endpoint=False)
    dx = x[1] - x[0]
    k = 2.0 * np.pi * np.fft.fftfreq(grid_size, d=dx)

    # Potential: Gaussian barrier
    V = barrier_height * np.exp(-(x / barrier_width) ** 2)

    # Initial state: Gaussian wave packet moving to the right
    psi = np.exp(-((x - x0) ** 2) / (2.0 * sigma**2)) * np.exp(1j * k0 * x)
    psi /= np.sqrt(np.sum(np.abs(psi) ** 2) * dx)

    phase_v_half = np.exp(-1j * V * dt / (2.0 * hbar))
    T_k = (hbar**2) * (k**2) / (2.0 * mass)
    phase_t = np.exp(-1j * T_k * dt / hbar)

    snapshots = []
    times = []
    norm_history = []
    x_mean_history = []
    p_mean_history = []
    uncertainty_history = []

    for n in range(steps + 1):
        if n % save_every == 0:
            density = np.abs(psi) ** 2
            snapshots.append(density.copy())
            times.append(n * dt)
            norm_history.append(np.sum(density) * dx)

            x_mean = np.sum(x * density) * dx
            x2_mean = np.sum((x**2) * density) * dx
            p_psi = momentum_operator(psi, k, hbar)
            p2_psi = momentum_squared_operator(psi, k, hbar)
            p_mean = np.real(np.sum(np.conj(psi) * p_psi) * dx)
            p2_mean = np.real(np.sum(np.conj(psi) * p2_psi) * dx)

            x_var = max(x2_mean - x_mean**2, 0.0)
            p_var = max(p2_mean - p_mean**2, 0.0)
            uncertainty_history.append(np.sqrt(x_var) * np.sqrt(p_var))
            x_mean_history.append(x_mean)
            p_mean_history.append(p_mean)

        psi = split_operator_step(psi, phase_v_half, phase_t)

    final_density = np.abs(psi) ** 2
    reflection = np.sum(final_density[x < -barrier_region]) * dx
    transmission = np.sum(final_density[x > barrier_region]) * dx
    near_barrier = np.sum(final_density[np.abs(x) <= barrier_region]) * dx

    diagnostics = {
        "final_norm": np.sum(final_density) * dx,
        "reflection": reflection,
        "transmission": transmission,
        "near_barrier": near_barrier,
        "probability_sum": reflection + transmission + near_barrier,
        "min_uncertainty": float(np.min(uncertainty_history)),
        "uncertainty_bound": 0.5 * hbar,
    }

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

    ax0 = axes[0]
    for density, t in zip(snapshots, times):
        ax0.plot(x, density, label=f"t={t:.1f}")
    scale = np.max(snapshots[0]) / np.max(V)
    ax0.plot(x, V * scale, "--", linewidth=2, label="Barrier (scaled)")
    ax0.set_title("1D Quantum Wave Packet Scattering")
    ax0.set_xlabel("x")
    ax0.set_ylabel(r"Probability density $|\psi|^2$")
    ax0.legend()
    ax0.grid(alpha=0.25)

    ax1 = axes[1]
    ax1.plot(times, norm_history, marker="o")
    ax1.set_title("Normalization Conservation Check")
    ax1.set_xlabel("time")
    ax1.set_ylabel("Integral |psi|^2 dx")
    ax1.grid(alpha=0.25)

    ax2 = axes[2]
    ax2.plot(times, x_mean_history, marker="o", label="<x>")
    ax2.plot(times, p_mean_history, marker="s", label="<p>")
    ax2.set_title("Expectation Values Over Time")
    ax2.set_xlabel("time")
    ax2.set_ylabel("value")
    ax2.legend()
    ax2.grid(alpha=0.25)

    ax3 = axes[3]
    ax3.plot(times, uncertainty_history, marker="^", label="DxDp")
    ax3.axhline(0.5 * hbar, linestyle="--", color="red", label="hbar/2")
    ax3.set_title("Uncertainty Principle Check")
    ax3.set_xlabel("time")
    ax3.set_ylabel("DxDp")
    ax3.legend()
    ax3.grid(alpha=0.25)

    plt.tight_layout()
    plt.show()


# %%
def validate_diagnostics(diagnostics, hbar=1.0, tol=1e-3):
    """Return validation checks for core physical constraints."""
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
                diagnostics["uncertainty_bound"],
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
        "uncertainty_bound_consistent": bool(
            abs(diagnostics["uncertainty_bound"] - 0.5 * hbar) <= tol
        ),
        "uncertainty_respected": bool(diagnostics["min_uncertainty"] + tol >= 0.5 * hbar),
    }
    checks["all_passed"] = all(checks.values())
    return checks


# %%
def main():
    result = simulate_1d_quantum_scattering()
    diag = result["diagnostics"]
    checks = validate_diagnostics(diag)

    print(f"Final normalization (should be ~1): {diag['final_norm']:.6f}")
    print(f"Reflection probability    : {diag['reflection']:.6f}")
    print(f"Transmission probability  : {diag['transmission']:.6f}")
    print(f"Near-barrier probability  : {diag['near_barrier']:.6f}")
    print(f"R + T + Near-barrier      : {diag['probability_sum']:.6f}")
    print(
        "Min uncertainty DxDp      : "
        f"{diag['min_uncertainty']:.6f} (>= {diag['uncertainty_bound']:.3f})"
    )
    print(f"Validation all passed      : {checks['all_passed']}")

    for name, passed in checks.items():
        if name == "all_passed":
            continue
        print(f"  - {name:25}: {passed}")

    plot_results(result)


if __name__ == "__main__":
    main()
